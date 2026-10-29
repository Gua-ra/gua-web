/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";

import SdkConfig from "../../../SdkConfig";
import ResolverClient, { type HomeserverResolution } from "../ResolverClient";
import {
    type AnswerFields,
    checkRosterSignature,
    detectRosterForm,
    hasAnswerFields,
    type LocatedHomeserver,
    locateHomeserver,
    type LogCheckpoint,
    parseSignedRoster,
    type SignedRoster,
} from "./canonical";
import { type CheckpointStore, localStorageCheckpointStore } from "./checkpointStore";
import { type TrustedKey, TrustedKeySet, VerifierCrypto } from "./ed25519";
import { ParseError } from "./json";
import { verifyMemberEntry } from "./memberEntry";
import { type LogEvent, MerkleTree, parseLogEvents, parseProof } from "./merkle";
import { phoneContext, reproducePlacement, type VerifiedPolicy } from "./placement";
import {
    canonicalPolicyBytes,
    delegateVerifiedZones,
    inEffect,
    parseRoutingPolicy,
    policyLogOutcome,
    policySignatureFailure,
    type PublishedPolicy,
    type RoutingPolicyBundle,
} from "./policy";
import {
    CHECK_ORDER,
    type CheckName,
    type CheckResult,
    type Environment,
    formatReport,
    indeterminate,
    invalid,
    overallOutcome,
    Reason,
    type ResolverVerificationReport,
    type RosterForm,
    unverifiable,
} from "./report";

const DEFAULT_BUDGET_MS = 10_000;
const MAX_LOG_SIZE = 4096;
const ARTIFACT_CHECKS: readonly CheckName[] = ["rosterSignature", "logConsistency", "policy"];
const ANSWER_CHECKS: readonly CheckName[] = ["homeserverMatch", "memberEntry", "placement"];

export interface ResolverVerificationConfig {
    environment: Environment;
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

/** Runs `body` holding the lock of one resolver base URL, which every tab and verifier instance shares. */
export type ResolverLock = <T>(signal: AbortSignal, body: () => Promise<T>) => Promise<T>;

export interface VerifierOptions {
    transport: VerifierTransport;
    config: ResolverVerificationConfig;
    checkpoints: CheckpointStore;
    /** Null where Web Locks is missing: the pin is then never touched. */
    lock: ResolverLock | null;
    /** Wall-clock time for validity windows; the budget runs on the monotonic clock. */
    now?: () => number;
    crypto?: VerifierCrypto;
    budgetMs?: number;
}

type Context = Required<VerifierOptions>;

function trustedKeys(list?: readonly { id: string; public_key: string }[]): TrustedKey[] {
    return (Array.isArray(list) ? list : [])
        .filter((k) => typeof k?.id === "string" && typeof k?.public_key === "string")
        .map((k) => ({ id: k.id, publicKey: k.public_key }));
}

/** A positive integer, else one signature: a malformed value must never compare as met. */
function threshold(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : 1;
}

/** Trust roots and the environment label come only from config.json. */
export function readVerificationConfig(): ResolverVerificationConfig {
    const raw = SdkConfig.get("gua_resolver")?.verification;
    const environment = raw?.environment;
    return {
        environment: environment === "dev" || environment === "prod" ? environment : "unknown",
        authorityKeys: trustedKeys(raw?.authority_keys),
        authorityThreshold: threshold(raw?.authority_threshold),
        policyKeys: trustedKeys(raw?.policy_keys),
        policyThreshold: threshold(raw?.policy_threshold),
    };
}

function webLock(baseUrl: string): ResolverLock | null {
    const locks: LockManager | undefined = globalThis.navigator?.locks;
    if (!locks) return null;
    return (signal, body) => locks.request(`gua-resolver-verification:${baseUrl}`, { signal }, body);
}

/** What the other checks report when the roster signature is not valid. */
function reasonAfterRoster(signature: CheckResult): Reason {
    return signature.outcome === "unverifiable" ? signature.reason : Reason.RosterUnverified;
}

/** Each check settles once. Waiters resume when it does; a deadline or a flush settles whatever is left. */
class Checks {
    private readonly results = new Map<CheckName, CheckResult>();
    private readonly waiters = new Map<CheckName, ((result: CheckResult) => void)[]>();

    public get(name: CheckName): CheckResult | undefined {
        return this.results.get(name);
    }

    public settle(name: CheckName, result: CheckResult): void {
        if (this.results.has(name)) return;
        this.results.set(name, result);
        for (const wake of this.waiters.get(name) ?? []) wake(result);
        this.waiters.delete(name);
    }

    public settleAll(names: readonly CheckName[], result: CheckResult): void {
        for (const name of names) this.settle(name, result);
    }

    public settled(name: CheckName): Promise<CheckResult> {
        const result = this.results.get(name);
        if (result) return Promise.resolve(result);
        return new Promise((resolve) => this.waiters.set(name, [...(this.waiters.get(name) ?? []), resolve]));
    }
}

/** The checks that do not depend on a /resolve answer: roster signature, log consistency and policy. */
class ArtifactsRun {
    public readonly checks = new Checks();
    public rosterForm: RosterForm | null = null;
    public roster: SignedRoster | null = null;
    public policy: VerifiedPolicy | null = null;
    private readonly abort = new AbortController();

    public constructor(private readonly context: Context) {
        const timer = setTimeout(() => {
            this.abort.abort();
            this.checks.settleAll(ARTIFACT_CHECKS, unverifiable(Reason.Timeout));
        }, context.budgetMs);
        void this.run()
            .catch(() => this.checks.settleAll(ARTIFACT_CHECKS, unverifiable(Reason.InternalError)))
            .finally(() => clearTimeout(timer));
    }

    public get running(): boolean {
        return ARTIFACT_CHECKS.some((name) => !this.checks.get(name));
    }

    public get rosterVersion(): number | null {
        return this.checks.get("rosterSignature")?.outcome === "valid" ? this.roster!.version : null;
    }

    public async settled(): Promise<void> {
        await Promise.all(ARTIFACT_CHECKS.map((name) => this.checks.settled(name)));
    }

    private async run(): Promise<void> {
        const { config, lock } = this.context;
        const authority = await TrustedKeySet.load(this.context.crypto, config.authorityKeys);
        if (authority.size === 0) {
            const reason = authority.refused > 0 ? Reason.CryptoUnsupported : Reason.NoTrustRoots;
            return this.rosterFailed(unverifiable(reason));
        }
        if (lock) {
            await lock(this.abort.signal, () => this.verifyRosterAndPin(authority));
        } else {
            await this.verifyRoster(authority);
            if (this.roster) this.checks.settle("logConsistency", unverifiable(Reason.StorageUnavailable));
        }
        if (this.roster) this.checks.settle("policy", await this.checkPolicy(this.roster.logCheckpoint));
    }

    /** One lock from the roster fetch to the pin write, so no run can pin from a stale roster or move the pin back. */
    private async verifyRosterAndPin(authority: TrustedKeySet): Promise<void> {
        await this.verifyRoster(authority);
        if (this.roster) {
            this.checks.settle("logConsistency", await this.checkLogConsistency(this.roster.logCheckpoint));
        }
    }

    private async verifyRoster(authority: TrustedKeySet): Promise<void> {
        let roster: SignedRoster;
        try {
            roster = parseSignedRoster(await this.context.transport.fetchRoster(this.abort.signal));
        } catch (e) {
            return this.rosterFailed(unverifiable(this.fetchFailure(e, Reason.RosterUnavailable)));
        }
        const form = detectRosterForm(roster);
        this.rosterForm = form;
        const signature = await checkRosterSignature(roster, form, authority, this.context.config.authorityThreshold);
        if (signature.outcome !== "valid") return this.rosterFailed(signature);
        this.roster = roster;
        this.checks.settle("rosterSignature", signature);
    }

    /** Nothing more is fetched for a roster that did not verify. */
    private rosterFailed(signature: CheckResult): void {
        this.checks.settle("rosterSignature", signature);
        this.checks.settleAll(["logConsistency", "policy"], unverifiable(reasonAfterRoster(signature)));
    }

    private fetchFailure(error: unknown, unavailable: Reason): Reason {
        if (this.abort.signal.aborted) return Reason.Timeout;
        return error instanceof ParseError ? Reason.ParseError : unavailable;
    }

    private async checkLogConsistency(served: LogCheckpoint): Promise<CheckResult> {
        let pinned: LogCheckpoint | null;
        try {
            pinned = this.context.checkpoints.load();
        } catch {
            return unverifiable(Reason.StorageUnavailable);
        }
        if (!pinned || pinned.size === 0) return this.pin(served, { outcome: "firstSeen" });
        if (served.size < pinned.size) return { outcome: "rollback" };
        if (served.size === pinned.size) {
            return { outcome: served.merkleRoot === pinned.merkleRoot ? "consistent" : "inconsistent" };
        }
        let proof: string[];
        try {
            const document = await this.context.transport.fetchConsistency(pinned.size, served.size, this.abort.signal);
            proof = parseProof(document);
        } catch (e) {
            return unverifiable(this.fetchFailure(e, Reason.LogUnavailable));
        }
        const merkle = new MerkleTree(this.context.crypto);
        const consistent = await merkle.verifyConsistency(
            pinned.size,
            served.size,
            pinned.merkleRoot,
            served.merkleRoot,
            proof,
        );
        return consistent ? this.pin(served, { outcome: "consistent" }) : { outcome: "inconsistent" };
    }

    private pin(checkpoint: LogCheckpoint, result: CheckResult): CheckResult {
        if (this.abort.signal.aborted) return unverifiable(Reason.Timeout);
        try {
            this.context.checkpoints.save(checkpoint);
        } catch {
            return unverifiable(Reason.StorageUnavailable);
        }
        return result;
    }

    private async checkPolicy(checkpoint: LogCheckpoint): Promise<CheckResult> {
        let document: unknown;
        try {
            document = await this.context.transport.fetchRoutingPolicy(this.abort.signal);
        } catch (e) {
            return unverifiable(this.fetchFailure(e, Reason.PolicyUnavailable));
        }
        if (document === null) return this.policyLogStep(null, checkpoint);
        let bundle: RoutingPolicyBundle;
        try {
            bundle = parseRoutingPolicy(document);
        } catch {
            return unverifiable(Reason.ParseError);
        }
        const canonical = canonicalPolicyBytes(bundle);
        const rejected = await this.policySignatureStep(bundle, canonical);
        if (rejected) return rejected;
        const { policyId, version } = bundle;
        const sha256Hex = await this.context.crypto.sha256Hex(canonical);
        const logged = await this.policyLogStep({ policyId, version, sha256Hex }, checkpoint);
        if (logged.outcome === "valid") {
            this.policy = { bundle, delegateVerifiedZones: await delegateVerifiedZones(this.context.crypto, bundle) };
        }
        return logged;
    }

    /** Signed by the policy keys and in effect now, before anything is fetched from the log. */
    private async policySignatureStep(bundle: RoutingPolicyBundle, canonical: Uint8Array): Promise<CheckResult | null> {
        const { config, crypto, now } = this.context;
        const keys = await TrustedKeySet.load(crypto, config.policyKeys);
        const unsigned = await policySignatureFailure(keys, bundle, canonical, config.policyThreshold);
        if (unsigned) return unsigned;
        return inEffect(bundle.notBefore, bundle.expiresAt, now()) ? null : invalid(Reason.OutsideWindow);
    }

    private async policyLogStep(served: PublishedPolicy | null, checkpoint: LogCheckpoint): Promise<CheckResult> {
        if (checkpoint.size > MAX_LOG_SIZE) return unverifiable(Reason.LogTooLarge);
        let events: LogEvent[];
        try {
            events = parseLogEvents(await this.context.transport.fetchLog(this.abort.signal));
        } catch (e) {
            return unverifiable(this.fetchFailure(e, Reason.LogUnavailable));
        }
        return policyLogOutcome(this.context.crypto, served, checkpoint, events);
    }
}

/** homeserverMatch, memberEntry and placement for one /resolve answer, and the one report line it logs. */
class AnswerRun {
    private readonly checks = new Checks();
    private readonly started = performance.now();
    private readonly answer: AnswerFields;
    private report: ResolverVerificationReport | null = null;

    public constructor(
        private readonly artifacts: ArtifactsRun,
        private readonly resolution: HomeserverResolution,
        private readonly phone: string,
        private readonly context: Context,
    ) {
        const { serverName, baseUrl, masIssuer } = resolution.homeserver;
        this.answer = { serverName, baseUrl, masIssuer: masIssuer ?? null };
    }

    public async complete(): Promise<ResolverVerificationReport> {
        const timer = setTimeout(() => this.finish(), this.context.budgetMs);
        await Promise.all([
            this.run().catch(() => this.checks.settleAll(ANSWER_CHECKS, unverifiable(Reason.InternalError))),
            this.artifacts.settled(),
        ]);
        clearTimeout(timer);
        return this.finish();
    }

    /** Logs the report once, as it stands: a check still running is unverifiable(timeout). */
    public finish(): ResolverVerificationReport {
        if (!this.report) {
            this.report = this.snapshot();
            logger.info(formatReport(this.report));
        }
        return this.report;
    }

    private snapshot(): ResolverVerificationReport {
        const checks = {} as Record<CheckName, CheckResult>;
        for (const name of CHECK_ORDER) {
            checks[name] = this.artifacts.checks.get(name) ?? this.checks.get(name) ?? unverifiable(Reason.Timeout);
        }
        return {
            ...checks,
            environment: this.context.config.environment,
            rosterVersion: this.artifacts.rosterVersion,
            rosterForm: this.artifacts.rosterForm,
            overall: overallOutcome(checks),
            durationMs: Math.round(performance.now() - this.started),
        };
    }

    private async run(): Promise<void> {
        const signature = await this.artifacts.checks.settled("rosterSignature");
        const roster = this.artifacts.roster;
        if (signature.outcome !== "valid" || !roster) {
            this.checks.settleAll(ANSWER_CHECKS, unverifiable(reasonAfterRoster(signature)));
            return;
        }
        const located = locateHomeserver(this.answer, roster);
        this.checks.settle("homeserverMatch", { outcome: located.match });
        // A directory lookup cannot be reproduced, so an existing account's placement is never compared.
        if (this.resolution.exists !== false) this.checks.settle("placement", indeterminate(Reason.ExistingAccount));
        this.checks.settle("memberEntry", await this.checkMember(located));
        if (this.resolution.exists === false) this.checks.settle("placement", await this.checkPlacement(roster));
    }

    private async checkMember(located: LocatedHomeserver): Promise<CheckResult> {
        if (located.match === "FIELD_MISMATCH" || located.match === "NOT_IN_ROSTER") {
            return unverifiable(Reason.NoMatchingEntry);
        }
        const { homeserver, member } = located.entry;
        return verifyMemberEntry(this.context.crypto, homeserver, member, this.context.now());
    }

    private async checkPlacement(roster: SignedRoster): Promise<CheckResult> {
        const policy = await this.artifacts.checks.settled("policy");
        if (policy.outcome !== "valid" && policy.outcome !== "notPresent") return unverifiable(Reason.PolicyUnverified);
        const { crypto, now } = this.context;
        const placement = await reproducePlacement(
            crypto,
            phoneContext(this.phone),
            roster,
            this.artifacts.policy,
            now(),
        );
        if (placement.unsignedRuleAbove) return indeterminate(Reason.UnsignedRule);
        if (placement.decision && hasAnswerFields(placement.decision.homeserver, this.answer)) {
            return { outcome: "match" };
        }
        // The resolver may have decided against another roster; only an answer naming this one can be a mismatch.
        return this.resolution.rosterVersion === roster.version
            ? { outcome: "mismatch" }
            : indeterminate(Reason.Unattributed);
    }
}

/**
 * Report-only verification of resolver answers. prepare() verifies the roster, log and policy when the phone step
 * opens, verify() checks each /resolve answer against them, and flush() logs every unfinished report before the page
 * leaves for sign-in. None of it delays or changes sign-in.
 */
export class ResolverVerification {
    private readonly context: Context;
    private artifacts: ArtifactsRun | null = null;
    private readonly pending = new Set<AnswerRun>();

    public constructor(options: VerifierOptions) {
        this.context = { now: Date.now, crypto: new VerifierCrypto(), budgetMs: DEFAULT_BUDGET_MS, ...options };
    }

    /** Null when no resolver is configured or verification is turned off. */
    public static fromConfig(): ResolverVerification | null {
        const resolver = ResolverClient.fromConfig();
        if (!resolver || SdkConfig.get("gua_resolver")?.verification?.mode === "off") return null;
        return new ResolverVerification({
            transport: resolver,
            config: readVerificationConfig(),
            checkpoints: localStorageCheckpointStore(resolver.baseUrl),
            lock: webLock(resolver.baseUrl),
        });
    }

    /** Starts on the artifacts unless a run is still under way; the last run's results serve later answers. */
    public prepare(): void {
        if (!this.artifacts?.running) this.artifacts = new ArtifactsRun(this.context);
    }

    /** Logs exactly one report for this answer, when its checks settle or at flush(), whichever comes first. */
    public verify(resolution: HomeserverResolution, phone: string): Promise<ResolverVerificationReport> {
        this.artifacts ??= new ArtifactsRun(this.context);
        const run = new AnswerRun(this.artifacts, resolution, phone, this.context);
        this.pending.add(run);
        return run.complete().finally(() => this.pending.delete(run));
    }

    /** Synchronous, so it can run immediately before navigation without delaying it. */
    public flush(): void {
        for (const run of this.pending) run.finish();
    }
}
