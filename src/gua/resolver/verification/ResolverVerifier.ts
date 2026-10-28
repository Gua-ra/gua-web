/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";

import SdkConfig from "../../../SdkConfig";
import { type ValidatedServerConfig } from "../../../utils/ValidatedServerConfig";
import { type HomeserverResolution, type ResolvedHomeserver } from "../ResolverClient";
import {
    canonicalRosterBytes,
    detectRosterForm,
    locateHomeserver,
    parseInstant,
    parseSignedRoster,
    type LogCheckpoint,
    type RosterEntry,
    type SignedRoster,
} from "./canonical";
import { type CheckpointStore, localStorageCheckpointStore } from "./checkpointStore";
import { CryptoUnsupportedError, type TrustedKey, TrustedKeySet, VerifierCrypto } from "./ed25519";
import { MemberEntryVerifier } from "./memberEntry";
import { type LogEvent, MerkleTree } from "./merkle";
import { phoneContext, reproducePlacement, type VerifiedPolicy } from "./placement";
import { canonicalPolicyBytes, parseRoutingPolicy, PolicyVerifier, type RoutingPolicyBundle } from "./policy";
import {
    allUnverifiable,
    check,
    overallOutcome,
    type Reason,
    type ReportChecks,
    reportLogFields,
    type ResolverVerificationReport,
    type RosterForm,
} from "./report";

export type ResolverVerificationMode = "off" | "report";

export interface ResolverVerificationConfig {
    mode: ResolverVerificationMode;
    authorityKeys: TrustedKey[];
    authorityThreshold: number;
    policyKeys: TrustedKey[];
    policyThreshold: number;
}

/** Anonymous reads of the resolver's public documents, as parsed JSON; a 404 on the policy is null. */
export interface VerifierTransport {
    fetchRoster(signal?: AbortSignal): Promise<unknown>;
    fetchLog(signal?: AbortSignal): Promise<unknown>;
    fetchConsistency(first: number, second: number, signal?: AbortSignal): Promise<unknown>;
    fetchRoutingPolicy(signal?: AbortSignal): Promise<unknown | null>;
}

export interface VerificationInput {
    transport: VerifierTransport;
    config: ResolverVerificationConfig;
    resolution: HomeserverResolution;
    phone: string;
    /** The OIDC issuer discovery produced for the resolved homeserver, once discovery settles. */
    discoveredIssuer?: Promise<string | undefined>;
    checkpoints: CheckpointStore;
    environment: string;
    now?: () => number;
    crypto?: VerifierCrypto;
    budgetMs?: number;
}

const DEFAULT_BUDGET_MS = 10_000;
const PENDING: Reason = "internal_error";

let lastReport: ResolverVerificationReport | undefined;

export function lastResolverVerificationReport(): ResolverVerificationReport | undefined {
    return lastReport;
}

/** Trust roots come only from config.json; an absent block leaves the verifier inert. */
export function readVerificationConfig(): ResolverVerificationConfig {
    const raw = SdkConfig.get("gua_resolver")?.verification;
    const keys = (list?: readonly { id: string; public_key: string }[]): TrustedKey[] =>
        (list ?? []).map((k) => ({ id: k.id, publicKey: k.public_key }));
    return {
        mode: raw?.mode === "off" ? "off" : "report",
        authorityKeys: keys(raw?.authority_keys),
        authorityThreshold: raw?.authority_threshold ?? 1,
        policyKeys: keys(raw?.policy_keys),
        policyThreshold: raw?.policy_threshold ?? 1,
    };
}

/** A label for the report, never a hostname: the authority key id without its common prefix. */
export function environmentLabel(config: ResolverVerificationConfig): string {
    const id = config.authorityKeys[0]?.id;
    return id ? id.replace(/^gua-authority-/, "") : "unconfigured";
}

/**
 * Run the report-only verification detached from the sign-in path. Nothing here is awaited by routing and
 * nothing here can throw into it.
 */
export function startResolverVerification(
    client: VerifierTransport & { baseUrl: string },
    resolution: HomeserverResolution,
    phone: string,
    discovery: Promise<ValidatedServerConfig>,
): void {
    try {
        const config = readVerificationConfig();
        if (config.mode === "off") return;
        void verifyResolution({
            transport: client,
            config,
            resolution,
            phone,
            discoveredIssuer: discovery.then(
                (c) => c.delegatedAuthentication?.issuer,
                () => undefined,
            ),
            checkpoints: localStorageCheckpointStore(client.baseUrl),
            environment: environmentLabel(config),
        }).catch(() => undefined);
    } catch {
        // Report-only: a fault in the verifier never reaches the sign-in path.
    }
}

export async function verifyResolution(input: VerificationInput): Promise<ResolverVerificationReport> {
    const now = input.now ?? Date.now;
    const started = now();
    const run = new Verification(input, now);
    await run.execute();
    const report: ResolverVerificationReport = {
        environment: input.environment,
        rosterVersion: run.rosterVersion,
        rosterForm: run.rosterForm,
        ...run.checks,
        overall: overallOutcome(run.checks),
        durationMs: Math.max(0, now() - started),
    };
    lastReport = report;
    logger.info("Gua resolver verification", reportLogFields(report));
    return report;
}

class Verification {
    public checks: ReportChecks = allUnverifiable("no_trust_roots");
    public rosterVersion: number | null = null;
    public rosterForm: RosterForm | null = null;

    private readonly crypto: VerifierCrypto;
    private readonly abort = new AbortController();
    private readonly deadline: number;

    public constructor(
        private readonly input: VerificationInput,
        private readonly now: () => number,
    ) {
        this.crypto = input.crypto ?? new VerifierCrypto();
        this.deadline = now() + (input.budgetMs ?? DEFAULT_BUDGET_MS);
    }

    public async execute(): Promise<void> {
        const timer = setTimeout(() => this.abort.abort(), Math.max(0, this.deadline - this.now()));
        try {
            await this.run();
        } catch (e) {
            this.settlePending(e instanceof CryptoUnsupportedError ? "crypto_unsupported" : "internal_error");
        } finally {
            clearTimeout(timer);
        }
    }

    private settlePending(reason: Reason): void {
        for (const name of Object.keys(this.checks) as (keyof ReportChecks)[]) {
            if (this.checks[name].outcome === "unverifiable" && this.checks[name].reason === PENDING) {
                this.checks[name] = check("unverifiable", reason);
            }
        }
    }

    private settleFrom(firstCheck: keyof ReportChecks, reason: Reason): void {
        let reached = false;
        for (const name of Object.keys(this.checks) as (keyof ReportChecks)[]) {
            if (name === firstCheck) reached = true;
            if (reached) this.checks[name] = check("unverifiable", reason);
        }
    }

    private async run(): Promise<void> {
        const { config, transport, resolution } = this.input;
        if (config.authorityKeys.length === 0) return;
        this.checks = allUnverifiable(PENDING);
        const authority = await TrustedKeySet.load(this.crypto, config.authorityKeys);
        if (authority.size === 0) {
            this.checks = allUnverifiable("no_trust_roots");
            return;
        }

        let document: unknown;
        try {
            document = await transport.fetchRoster(this.abort.signal);
        } catch {
            this.settleFrom("rosterSignature", "roster_unavailable");
            return;
        }
        let roster: SignedRoster;
        try {
            roster = parseSignedRoster(document);
        } catch {
            this.settleFrom("rosterSignature", "parse_error");
            return;
        }
        this.rosterVersion = roster.version;
        const form = detectRosterForm(roster);
        this.rosterForm = form;
        if (form === "mixed") {
            this.settleFrom("rosterSignature", "mixed_roster_form");
            return;
        }

        const votes = await authority.countVotes(
            canonicalRosterBytes(roster, form),
            roster.authoritySignatures.map((s) => ({ keyId: s.authorityKeyId, signatureB64: s.signatureB64 })),
        );
        if (votes.valid < Math.max(1, config.authorityThreshold)) {
            const reason: Reason =
                votes.known === 0 ? "unknown_key_id" : votes.valid === 0 ? "bad_signature" : "threshold_not_met";
            this.checks.rosterSignature = check("invalid", reason);
            this.settleFrom("homeserverMatch", "roster_unverified");
            return;
        }
        this.checks.rosterSignature = check("valid");

        const answer = resolution.homeserver;
        const located = locateHomeserver(answer.serverName, answer.baseUrl, answer.masIssuer ?? null, roster);
        const issuer = this.input.discoveredIssuer ? await this.untilDeadline(this.input.discoveredIssuer) : undefined;
        const rosterIssuer = located.entry?.homeserver.masIssuer ?? null;
        const issuerDiffers = issuer !== undefined && rosterIssuer !== null && !sameIssuer(issuer, rosterIssuer);
        this.checks.homeserverMatch = check(
            located.match === "ACTIVE_MATCH" && issuerDiffers ? "FIELD_MISMATCH" : located.match,
        );

        await this.checkMember(located.entry);
        await this.checkLogConsistency(roster.logCheckpoint);
        const policy = await this.checkPolicy(roster.logCheckpoint);
        if (policy !== undefined) await this.checkPlacement(roster, policy, answer);
    }

    private async checkMember(entry: RosterEntry | null): Promise<void> {
        if (!entry) {
            this.checks.memberEntry = check("unverifiable");
            return;
        }
        const result = await new MemberEntryVerifier(this.crypto).verify(entry.homeserver, entry.member, this.now());
        this.checks.memberEntry = check(result.outcome, result.reason);
    }

    private async checkLogConsistency(served: LogCheckpoint): Promise<void> {
        const pinned = this.input.checkpoints.load();
        if (!pinned || pinned.size === 0) {
            this.checks.logConsistency = check("firstSeen");
            this.input.checkpoints.save(served);
            return;
        }
        if (served.size === pinned.size) {
            this.checks.logConsistency = check(served.merkleRoot === pinned.merkleRoot ? "consistent" : "inconsistent");
            return;
        }
        if (served.size < pinned.size) {
            this.checks.logConsistency = check("rollback");
            return;
        }
        let proof: string[];
        try {
            proof = parseProof(
                await this.input.transport.fetchConsistency(pinned.size, served.size, this.abort.signal),
            );
        } catch (e) {
            this.checks.logConsistency = check(
                "unverifiable",
                e instanceof ParseError ? "parse_error" : "log_unavailable",
            );
            return;
        }
        const merkle = new MerkleTree(this.crypto);
        const consistent = await merkle.verifyConsistency(
            pinned.size,
            served.size,
            pinned.merkleRoot,
            served.merkleRoot,
            proof,
        );
        this.checks.logConsistency = check(consistent ? "consistent" : "inconsistent");
        if (consistent) this.input.checkpoints.save(served);
    }

    /** Returns the verified policy, null when none is served, undefined when placement cannot be reproduced. */
    private async checkPolicy(served: LogCheckpoint): Promise<VerifiedPolicy | null | undefined> {
        const { config, transport } = this.input;
        let document: unknown;
        try {
            document = await transport.fetchRoutingPolicy(this.abort.signal);
        } catch {
            return this.policyUnverifiable("policy_unavailable");
        }
        if (document === null) {
            this.checks.policy = check("notPresent");
            return null;
        }
        let bundle: RoutingPolicyBundle;
        try {
            bundle = parseRoutingPolicy(document);
        } catch {
            return this.policyUnverifiable("parse_error");
        }
        const keys = await TrustedKeySet.load(this.crypto, config.policyKeys);
        if (keys.size === 0) return this.policyUnverifiable("no_policy_keys");

        const canonical = canonicalPolicyBytes(bundle);
        const votes = await keys.countVotes(
            canonical,
            bundle.signatures.map((s) => ({ keyId: s.authorityKeyId, signatureB64: s.signatureB64 })),
        );
        if (votes.valid < Math.max(1, config.policyThreshold)) {
            const reason: Reason =
                votes.known === 0 ? "unknown_key_id" : votes.valid === 0 ? "bad_signature" : "threshold_not_met";
            return this.policyInvalid(reason);
        }

        let events: LogEvent[];
        try {
            events = parseLogEvents(await transport.fetchLog(this.abort.signal));
        } catch (e) {
            return this.policyUnverifiable(e instanceof ParseError ? "parse_error" : "log_unavailable");
        }
        const policyHash = await this.crypto.sha256Hex(canonical);
        if (!events.some((e) => e.type === "POLICY_PUBLISH" && e.payloadHash === policyHash)) {
            return this.policyInvalid("policy_not_logged");
        }
        const merkle = new MerkleTree(this.crypto);
        const leaves: string[] = [];
        for (const event of events.slice(0, served.size))
            leaves.push(await merkle.leafHash(MerkleTree.leafData(event)));
        if (events.length < served.size || (await merkle.root(leaves)) !== served.merkleRoot) {
            return this.policyInvalid("log_mismatch");
        }

        this.checks.policy = check("valid");
        const verifier = new PolicyVerifier(this.crypto, keys, config.policyThreshold);
        return { bundle, delegateVerifiedZones: await verifier.delegateVerifiedZones(bundle) };
    }

    private policyUnverifiable(reason: Reason): undefined {
        this.checks.policy = check("unverifiable", reason);
        this.checks.placement = check("unverifiable", "policy_unverified");
        return undefined;
    }

    /** A refused policy is the failing check; reproducing a decision over it would mean nothing. */
    private policyInvalid(reason: Reason): undefined {
        this.checks.policy = check("invalid", reason);
        this.checks.placement = check("notApplicable");
        return undefined;
    }

    private async checkPlacement(
        roster: SignedRoster,
        policy: VerifiedPolicy | null,
        answer: ResolvedHomeserver,
    ): Promise<void> {
        const decision = await reproducePlacement(
            this.crypto,
            phoneContext(this.input.phone),
            roster,
            policy,
            this.now(),
        );
        const reproduced = decision ? roster.entries.find((e) => e.homeserver.id === decision.homeserverId) : undefined;
        const same =
            reproduced !== undefined &&
            reproduced.homeserver.serverName === answer.serverName &&
            reproduced.homeserver.baseUrl === answer.baseUrl &&
            reproduced.homeserver.masIssuer === (answer.masIssuer ?? null);
        if (same) {
            this.checks.placement = check("match");
            return;
        }
        // Without a decision trace a directory hit is not reproducible, so only a declared placement can mismatch.
        this.checks.placement = check(this.input.resolution.exists === false ? "mismatch" : "indeterminate");
    }

    private untilDeadline<T>(promise: Promise<T>): Promise<T | undefined> {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(undefined), Math.max(0, this.deadline - this.now()));
            promise.then(
                (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                () => {
                    clearTimeout(timer);
                    resolve(undefined);
                },
            );
        });
    }
}

class ParseError extends Error {}

const SHA256_HEX = /^[0-9a-f]{64}$/;

function sameIssuer(a: string, b: string): boolean {
    return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

function parseProof(document: unknown): string[] {
    const proof = (document as { proof?: unknown } | null)?.proof;
    if (!Array.isArray(proof) || proof.some((p) => typeof p !== "string" || !SHA256_HEX.test(p))) {
        throw new ParseError("proof");
    }
    return proof as string[];
}

function parseLogEvents(document: unknown): LogEvent[] {
    const events = (document as { events?: unknown } | null)?.events;
    if (!Array.isArray(events)) throw new ParseError("events");
    const parsed = events.map((e): LogEvent => {
        const raw = e as Record<string, unknown>;
        const recordedAt = typeof raw.recordedAt === "string" ? parseInstant(raw.recordedAt) : null;
        if (
            typeof raw.index !== "number" ||
            typeof raw.type !== "string" ||
            typeof raw.payloadHash !== "string" ||
            (raw.homeserverId !== null && raw.homeserverId !== undefined && typeof raw.homeserverId !== "string") ||
            !recordedAt
        ) {
            throw new ParseError("event");
        }
        return {
            index: raw.index,
            type: raw.type,
            homeserverId: (raw.homeserverId as string | null | undefined) ?? null,
            payloadHash: raw.payloadHash,
            recordedAtEpochMs: recordedAt.epochMs,
        };
    });
    return parsed.sort((a, b) => a.index - b.index);
}
