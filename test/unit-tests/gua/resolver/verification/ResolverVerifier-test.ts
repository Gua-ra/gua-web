/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "matrix-js-sdk/src/logger";

import SdkConfig from "../../../../../src/SdkConfig";
import ResolverClient, { type HomeserverResolution, NOT_FOUND } from "../../../../../src/gua/resolver/ResolverClient";
import {
    canonicalRosterBytes,
    detectRosterForm,
    type LogCheckpoint,
    parseSignedRoster,
} from "../../../../../src/gua/resolver/verification/canonical";
import {
    type CheckpointStore,
    localStorageCheckpointStore,
} from "../../../../../src/gua/resolver/verification/checkpointStore";
import {
    bytesToHex,
    decodeEd25519Spki,
    type TrustedKey,
    VerifierCrypto,
} from "../../../../../src/gua/resolver/verification/ed25519";
import { memberEntryBytes, parseMemberBlock } from "../../../../../src/gua/resolver/verification/memberEntry";
import {
    phoneContext,
    type Placement,
    reproducePlacement,
} from "../../../../../src/gua/resolver/verification/placement";
import { canonicalPolicyBytes, parseRoutingPolicy } from "../../../../../src/gua/resolver/verification/policy";
import { type CheckResult, Reason } from "../../../../../src/gua/resolver/verification/report";
import {
    readVerificationConfig,
    type ResolverLock,
    ResolverVerification,
    type ResolverVerificationConfig,
    type VerifierOptions,
    type VerifierTransport,
} from "../../../../../src/gua/resolver/verification/ResolverVerifier";

// jsdom has no SubtleCrypto; the verifier reads globalThis.crypto.subtle exactly as a browser would.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

type Json = Record<string, any>;

interface TrustedKeyVector {
    id: string;
    publicKeySpkiB64: string;
}

interface RosterVector {
    ref?: string;
    name: string;
    roster: Json;
    trustedKeys: TrustedKeyVector[];
    threshold: number;
}

interface PolicyVector {
    ref?: string;
    name: string;
    bundle: Json;
    trustedKeys: TrustedKeyVector[];
    threshold: number;
}

interface Vectors {
    keys: Record<string, { publicKeySpkiB64: string; privateKeyPkcs8B64?: string }>;
    rosters: RosterVector[];
    rosterRejections: RosterVector[];
    log: {
        events: Json[];
        roots: { size: number; rootHex: string }[];
        consistencyProofs: { first: number; second: number; proof: string[] }[];
    };
    policies: PolicyVector[];
    policyRejections: PolicyVector[];
}

const vectors: Vectors = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "gua-client-verification-v1-vectors.json"), "utf8"),
);

function byRef<T extends { ref?: string }>(list: T[], ref: string): T {
    return list.find((v) => v.ref === ref)!;
}

function byName<T extends { name: string }>(list: T[], prefix: string): T {
    return list.find((v) => v.name.startsWith(prefix))!;
}

const r1 = byRef(vectors.rosters, "r1");
const r2 = byRef(vectors.rosters, "r2");
const policy = byRef(vectors.policies, "br-policy v3");

const PHONE = "+5511987654321";
const NOW = Date.parse("2026-10-27T00:00:00Z");

const br = {
    serverName: "br.gua.test",
    baseUrl: "https://matrix.br.gua.test",
    masIssuer: "https://account.br.gua.test",
};
const ca = {
    serverName: "ca.gua.test",
    baseUrl: "https://matrix.ca.gua.test",
    masIssuer: "https://account.ca.gua.test",
};
const brAnswer: HomeserverResolution = { exists: false, homeserver: br };
const caAnswer: HomeserverResolution = { exists: false, homeserver: ca };

function trustedKeys(list: TrustedKeyVector[]): TrustedKey[] {
    return list.map((k) => ({ id: k.id, publicKey: k.publicKeySpkiB64 }));
}

const config: ResolverVerificationConfig = {
    environment: "dev",
    authorityKeys: trustedKeys(r2.trustedKeys),
    authorityThreshold: r2.threshold,
    policyKeys: trustedKeys(policy.trustedKeys),
    policyThreshold: policy.threshold,
};

/** Trusts authority-a alone, which signed r1, r2, r5 and every roster these tests sign. */
const authorityA: ResolverVerificationConfig = {
    ...config,
    authorityKeys: trustedKeys(r1.trustedKeys),
    authorityThreshold: 1,
};

function copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function rootAt(size: number): string {
    return vectors.log.roots.find((r) => r.size === size)!.rootHex;
}

function consistencyProof(first: number, second: number): Json {
    const proof = vectors.log.consistencyProofs.find((p) => p.first === first && p.second === second);
    if (!proof) throw new Error(`no proof vector for ${first} to ${second}`);
    return { first, second, proof: proof.proof };
}

interface MemoryStore extends CheckpointStore {
    current: LogCheckpoint | null;
}

function memoryStore(initial: LogCheckpoint | null = null): MemoryStore {
    const store: MemoryStore = {
        current: initial,
        load: () => store.current,
        save: (checkpoint) => {
            store.current = checkpoint;
        },
    };
    return store;
}

/** Web Locks for one name: each holder runs after the previous one has finished. */
function memoryLock(): ResolverLock {
    let tail: Promise<unknown> = Promise.resolve();
    return (_signal, body) => {
        const held = tail.then(body);
        tail = held.catch(() => undefined);
        return held;
    };
}

interface StubTransport extends VerifierTransport {
    calls: string[];
}

/** Serves roster r2, the full log and policy br-policy v3 unless overridden; every call is recorded by name. */
function stubTransport(overrides: Partial<VerifierTransport> = {}): StubTransport {
    const calls: string[] = [];
    const impl: VerifierTransport = {
        fetchRoster: async () => r2.roster,
        fetchLog: async () => ({ head: r2.roster.logCheckpoint, events: vectors.log.events }),
        fetchConsistency: async (first, second) => consistencyProof(first, second),
        fetchRoutingPolicy: async () => policy.bundle,
        ...overrides,
    };
    return {
        calls,
        fetchRoster: (signal) => {
            calls.push("roster");
            return impl.fetchRoster(signal);
        },
        fetchLog: (signal) => {
            calls.push("log");
            return impl.fetchLog(signal);
        },
        fetchConsistency: (first, second, signal) => {
            calls.push(`consistency ${first} ${second}`);
            return impl.fetchConsistency(first, second, signal);
        },
        fetchRoutingPolicy: (signal) => {
            calls.push("policy");
            return impl.fetchRoutingPolicy(signal);
        },
    };
}

function verifier(options: Partial<VerifierOptions> = {}): ResolverVerification {
    return new ResolverVerification({
        transport: stubTransport(),
        config,
        checkpoints: memoryStore(),
        lock: memoryLock(),
        now: () => NOW,
        ...options,
    });
}

type RunOptions = Partial<VerifierOptions> & { resolution?: HomeserverResolution };

function run({ resolution = brAnswer, ...options }: RunOptions = {}): ReturnType<ResolverVerification["verify"]> {
    return verifier(options).verify(resolution, PHONE);
}

function unverifiable(reason: Reason): CheckResult {
    return { outcome: "unverifiable", reason };
}

function invalid(reason: Reason): CheckResult {
    return { outcome: "invalid", reason };
}

function everyCheck(result: CheckResult): Json {
    return {
        rosterSignature: result,
        homeserverMatch: result,
        memberEntry: result,
        logConsistency: result,
        policy: result,
        placement: result,
    };
}

/** A roster that is not valid, for any reason but missing trust roots or crypto, leaves the rest roster_unverified. */
function rosterFailure(reason: Reason): Json {
    return { ...everyCheck(unverifiable(Reason.RosterUnverified)), rosterSignature: unverifiable(reason) };
}

async function until(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !condition(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(condition()).toBe(true);
}

function base64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

/** Signs with an RFC 8032 test key from the vectors' keys section. */
async function sign(keyName: string, message: Uint8Array): Promise<string> {
    const pkcs8 = Uint8Array.from(atob(vectors.keys[keyName].privateKeyPkcs8B64!), (c) => c.charCodeAt(0));
    const key = await webcrypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
    return base64(new Uint8Array(await webcrypto.subtle.sign({ name: "Ed25519" }, key, message)));
}

/** The roster as authority-a (RFC 8032 test 1) would sign it after the edit. */
async function signedRoster(roster: Json): Promise<Json> {
    const parsed = parseSignedRoster(roster);
    const bytes = canonicalRosterBytes(parsed, detectRosterForm(parsed) as "v1" | "legacy");
    return {
        ...roster,
        authoritySignatures: [{ authorityKeyId: "authority-a", signatureB64: await sign("rfc8032-test1", bytes) }],
    };
}

/** WebCrypto that will not import the keys `refuses` picks, as a browser can refuse a key it does not support. */
function refusingSubtle(refuses: (spki: Uint8Array) => boolean): SubtleCrypto {
    const subtle = webcrypto.subtle as unknown as SubtleCrypto;
    return {
        digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => subtle.digest(algorithm, data),
        verify: (algorithm: AlgorithmIdentifier, key: CryptoKey, signature: BufferSource, data: BufferSource) =>
            subtle.verify(algorithm, key, signature, data),
        importKey: async (
            format: "spki",
            keyData: Uint8Array,
            algorithm: AlgorithmIdentifier,
            extractable: boolean,
            usages: KeyUsage[],
        ) => {
            if (refuses(keyData)) throw new DOMException("not supported", "NotSupportedError");
            return subtle.importKey(format, keyData, algorithm, extractable, usages);
        },
    } as unknown as SubtleCrypto;
}

function isKey(publicKeyB64: string): (spki: Uint8Array) => boolean {
    const refused = bytesToHex(decodeEd25519Spki(publicKeyB64)!);
    return (spki) => bytesToHex(spki) === refused;
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}

/** A resolver whose /roster answers 200 with this body and every other document 404. */
function rosterServedAs(body: Uint8Array): ResolverClient {
    globalThis.fetch = jest.fn(async (url: string) => {
        const found = url === "https://resolver.example/roster";
        return { ok: found, status: found ? 200 : 404, body: found ? streamOf(body) : null } as unknown as Response;
    }) as unknown as typeof fetch;
    return new ResolverClient("https://resolver.example");
}

function deeplyNested(depth: number): string {
    return "[".repeat(depth) + "]".repeat(depth);
}

describe("ResolverVerification", () => {
    const realFetch = globalThis.fetch;

    beforeEach(() => {
        jest.spyOn(logger, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        globalThis.fetch = realFetch;
        SdkConfig.reset();
        window.localStorage.clear();
    });

    describe("trust roots", () => {
        it("reports every check no_trust_roots and fetches nothing when no keys are configured", async () => {
            const transport = stubTransport();
            const report = await run({ transport, config: { ...config, authorityKeys: [] } });

            expect(report).toMatchObject(everyCheck(unverifiable(Reason.NoTrustRoots)));
            expect(report.overall).toEqual({ outcome: "unverifiable", check: "rosterSignature" });
            expect(transport.calls).toEqual([]);
        });

        it("treats keys that are not Ed25519 SPKI as no trust roots", async () => {
            const transport = stubTransport();
            const report = await run({
                transport,
                config: { ...config, authorityKeys: [{ id: "authority-a", publicKey: "bm90IGEga2V5" }] },
            });

            expect(report).toMatchObject(everyCheck(unverifiable(Reason.NoTrustRoots)));
            expect(transport.calls).toEqual([]);
        });

        it("reports crypto_unsupported without fetching when the browser has no SubtleCrypto", async () => {
            const transport = stubTransport();
            const report = await run({ transport, crypto: new VerifierCrypto(null) });

            expect(report).toMatchObject(everyCheck(unverifiable(Reason.CryptoUnsupported)));
            expect(transport.calls).toEqual([]);
        });

        it("reports crypto_unsupported without fetching when the browser cannot import Ed25519 keys", async () => {
            const transport = stubTransport();
            const report = await run({ transport, crypto: new VerifierCrypto(refusingSubtle(() => true)) });

            expect(report).toMatchObject(everyCheck(unverifiable(Reason.CryptoUnsupported)));
            expect(transport.calls).toEqual([]);
        });
    });

    describe("roster", () => {
        it("reports roster_unavailable when the roster cannot be fetched, and fetches nothing more", async () => {
            const store = memoryStore();
            const transport = stubTransport({
                fetchRoster: async () => {
                    throw new Error("network");
                },
            });
            const report = await run({ transport, checkpoints: store });

            expect(report).toMatchObject(rosterFailure(Reason.RosterUnavailable));
            expect(report.rosterForm).toBeNull();
            expect(store.current).toBeNull();
            expect(transport.calls).toEqual(["roster"]);
        });

        it("reports roster_unavailable when the browser refuses the request, as a failed CORS preflight does", async () => {
            globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
            const report = await run({ transport: new ResolverClient("https://resolver.example") });

            expect(report.rosterSignature).toEqual(unverifiable(Reason.RosterUnavailable));
        });

        it("reports a roster that does not arrive within the budget as timeout", async () => {
            const transport = stubTransport({
                fetchRoster: (signal) =>
                    new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")))),
            });
            const report = await run({ transport, budgetMs: 20 });

            expect(report).toMatchObject(rosterFailure(Reason.Timeout));
        });

        it("reports a roster body that is not JSON as parse_error", async () => {
            const report = await run({ transport: rosterServedAs(new TextEncoder().encode("<html>busy</html>")) });

            expect(report).toMatchObject(rosterFailure(Reason.ParseError));
        });

        it("reports parse_error promptly for a roster whose ignored field nests 100,000 arrays", async () => {
            const body = JSON.stringify(r2.roster).replace(/}$/, `,"ignored":${deeplyNested(100_000)}}`);
            const report = await run({ transport: rosterServedAs(new TextEncoder().encode(body)) });

            expect(report).toMatchObject(rosterFailure(Reason.ParseError));
        });

        it("reports parse_error promptly for a roster whose first member block nests 100,000 arrays", async () => {
            const roster = copy(r2.roster);
            roster.entries[0].member = "NESTED";
            const body = JSON.stringify(roster).replace('"NESTED"', deeplyNested(100_000));
            const report = await run({ transport: rosterServedAs(new TextEncoder().encode(body)) });

            expect(report).toMatchObject(rosterFailure(Reason.ParseError));
        });

        it("reports parse_error for a 3 MiB roster", async () => {
            const report = await run({ transport: rosterServedAs(new Uint8Array(3 * 1024 * 1024).fill(0x20)) });

            expect(report.rosterSignature).toEqual(unverifiable(Reason.ParseError));
        });

        it("refuses a roster that mixes the two forms and reports no version", async () => {
            const mixed = byName(vectors.rosterRejections, "some entries have searchVisibility").roster;
            const report = await run({ transport: stubTransport({ fetchRoster: async () => mixed }) });

            expect(report.rosterForm).toBe("mixed");
            expect(report.rosterVersion).toBeNull();
            expect(report).toMatchObject(rosterFailure(Reason.MixedRosterForm));
        });

        it("reports a checkpoint size past 2^31 as parse_error", async () => {
            const roster = { ...copy(r2.roster), logCheckpoint: { merkleRoot: rootAt(7), size: 2 ** 32 } };
            const report = await run({ transport: stubTransport({ fetchRoster: async () => roster }) });

            expect(report.rosterSignature).toEqual(unverifiable(Reason.ParseError));
        });

        it.each([
            ["acceptsNew sent as a string", (r: Json) => (r.entries[0].homeserver.acceptsNew = "true")],
            ["a null weight", (r: Json) => (r.entries[0].homeserver.weight = null)],
            ["a null status", (r: Json) => (r.entries[0].status = null)],
            ["null authoritySignatures", (r: Json) => (r.authoritySignatures = null)],
            ["a timestamp with a sign", (r: Json) => (r.issuedAt = "+2026-10-03T00:00:00Z")],
        ])("reports a roster with %s as parse_error", async (_case, change) => {
            const roster = copy(r2.roster);
            change(roster);
            const report = await run({ transport: stubTransport({ fetchRoster: async () => roster }) });

            expect(report.rosterSignature).toEqual(unverifiable(Reason.ParseError));
        });

        it("reads the form before the timestamps, so a mixed roster with a bad one is mixed_roster_form", async () => {
            const mixed = copy(byName(vectors.rosterRejections, "some entries have searchVisibility").roster);
            mixed.issuedAt = "yesterday";
            const report = await run({ transport: stubTransport({ fetchRoster: async () => mixed }) });

            expect(report.rosterForm).toBe("mixed");
            expect(report.rosterSignature).toEqual(unverifiable(Reason.MixedRosterForm));
        });

        it("counts a signature entry without a key id or a value as one that does not verify", async () => {
            const roster = copy(r2.roster);
            roster.authoritySignatures.push({}, { authorityKeyId: "authority-a" });
            const report = await run({ transport: stubTransport({ fetchRoster: async () => roster }) });

            expect(report.rosterSignature).toEqual({ outcome: "valid" });
        });

        it("reports a tampered roster as bad_signature with no version and the other checks roster_unverified", async () => {
            const tampered = byName(vectors.rosterRejections, "baseUrl changed after signing");
            const report = await run({
                transport: stubTransport({ fetchRoster: async () => tampered.roster }),
                config: authorityA,
            });

            expect(report.rosterSignature).toEqual(invalid(Reason.BadSignature));
            expect(report.rosterVersion).toBeNull();
            expect(report.rosterForm).toBe("v1");
            expect(report.homeserverMatch).toEqual(unverifiable(Reason.RosterUnverified));
            expect(report.placement).toEqual(unverifiable(Reason.RosterUnverified));
            expect(report.overall).toEqual({ outcome: "failed", check: "rosterSignature" });
        });

        it("reports a roster signed by an unknown key as unknown_key_id", async () => {
            const untrusted = byName(vectors.rosterRejections, "signed by a key the client does not trust");
            const report = await run({
                transport: stubTransport({ fetchRoster: async () => untrusted.roster }),
                config: authorityA,
            });

            expect(report.rosterSignature).toEqual(invalid(Reason.UnknownKeyId));
        });

        it("reports a roster whose signatures do not meet the threshold as threshold_not_met", async () => {
            const report = await run({ transport: stubTransport({ fetchRoster: async () => r1.roster }) });

            expect(report.rosterSignature).toEqual(invalid(Reason.ThresholdNotMet));
            expect(report.rosterVersion).toBeNull();
            expect(report.logConsistency).toEqual(unverifiable(Reason.RosterUnverified));
        });
    });

    describe("homeserverMatch and memberEntry", () => {
        it("verifies the member block of the entry the answer matched", async () => {
            const report = await run();

            expect(report.homeserverMatch).toEqual({ outcome: "ACTIVE_MATCH" });
            expect(report.memberEntry).toEqual({ outcome: "valid" });
        });

        it("checks the ACTIVE entry's block, not a SUSPENDED duplicate's served before it", async () => {
            const roster = copy(r2.roster);
            const active = roster.entries.find((e: Json) => e.homeserver.id === "hs-br");
            const standby = copy(active);
            standby.homeserver.id = "hs-br-standby";
            standby.status = "SUSPENDED";
            const unsigned = { ...active.member, signatures: [] };
            const bytes = memberEntryBytes(standby.homeserver, parseMemberBlock(unsigned));
            standby.member.signatures = [{ keyId: "hs-br-1", signatureB64: await sign("rfc8032-test-sha-abc", bytes) }];
            // The ACTIVE entry carries the standby's block, which signs another homeserver id.
            active.member = copy(standby.member);
            roster.entries = [standby, ...roster.entries];
            const served = await signedRoster(roster);

            const report = await run({
                transport: stubTransport({ fetchRoster: async () => served }),
                config: authorityA,
            });

            expect(report.rosterSignature).toEqual({ outcome: "valid" });
            expect(report.homeserverMatch).toEqual({ outcome: "ACTIVE_MATCH" });
            expect(report.memberEntry).toEqual(invalid(Reason.BadSignature));
        });

        it("checks the SUSPENDED entry an answer matches exactly in r5", async () => {
            const r5 = byRef(vectors.rosters, "r5");
            const report = await run({
                transport: stubTransport({ fetchRoster: async () => r5.roster }),
                config: authorityA,
                resolution: caAnswer,
            });

            expect(report.homeserverMatch).toEqual({ outcome: "INACTIVE" });
            expect(report.memberEntry).toEqual({ outcome: "unattested" });
            expect(report.overall).toEqual({ outcome: "failed", check: "homeserverMatch" });
        });

        it("reports FIELD_MISMATCH and no_matching_entry for a known server name with another base URL", async () => {
            const report = await run({
                resolution: { exists: true, homeserver: { ...br, baseUrl: "https://matrix.evil.test" } },
            });

            expect(report.homeserverMatch).toEqual({ outcome: "FIELD_MISMATCH" });
            expect(report.memberEntry).toEqual(unverifiable(Reason.NoMatchingEntry));
            expect(report.overall).toEqual({ outcome: "failed", check: "homeserverMatch" });
        });

        it("reports a member window bound that does not parse as parse_error", async () => {
            // The member block is outside the authority's signature, so the roster stays valid.
            const roster = copy(r2.roster);
            roster.entries.find((e: Json) => e.homeserver.id === "hs-br").member.notBefore = "2026-09-01";
            const report = await run({ transport: stubTransport({ fetchRoster: async () => roster }) });

            expect(report.rosterSignature).toEqual({ outcome: "valid" });
            expect(report.memberEntry).toEqual(invalid(Reason.ParseError));
        });

        it("reports a null member field as parse_error", async () => {
            const roster = copy(r2.roster);
            roster.entries.find((e: Json) => e.homeserver.id === "hs-br").member.keyId = null;
            const report = await run({ transport: stubTransport({ fetchRoster: async () => roster }) });

            expect(report.memberEntry).toEqual(invalid(Reason.ParseError));
        });

        it("checks the schema before a member window bound that does not parse", async () => {
            const roster = copy(r2.roster);
            const member = roster.entries.find((e: Json) => e.homeserver.id === "hs-br").member;
            Object.assign(member, { schema: "gua-member-entry.v2", notBefore: "2026-09-01" });
            const report = await run({ transport: stubTransport({ fetchRoster: async () => roster }) });

            expect(report.memberEntry).toEqual(invalid(Reason.UnsupportedSchema));
        });

        it("reports a member signing key the browser refuses as bad_signing_key and still checks the log", async () => {
            const hsBr = r2.roster.entries.find((e: Json) => e.homeserver.id === "hs-br");
            const report = await run({ crypto: new VerifierCrypto(refusingSubtle(isKey(hsBr.homeserver.signingKey))) });

            expect(report.rosterSignature).toEqual({ outcome: "valid" });
            expect(report.memberEntry).toEqual(invalid(Reason.BadSigningKey));
            expect(report.logConsistency).toEqual({ outcome: "firstSeen" });
            expect(report.policy).toEqual({ outcome: "valid" });
        });
    });

    describe("logConsistency", () => {
        it("pins the first checkpoint it sees", async () => {
            const store = memoryStore();
            const report = await run({ checkpoints: store });

            expect(report.logConsistency).toEqual({ outcome: "firstSeen" });
            expect(store.current).toEqual(r2.roster.logCheckpoint);
        });

        it("moves the pin forward after a verified consistency proof", async () => {
            const store = memoryStore({ merkleRoot: rootAt(3), size: 3 });
            const transport = stubTransport();
            const report = await run({ transport, checkpoints: store });

            expect(report.logConsistency).toEqual({ outcome: "consistent" });
            expect(transport.calls).toContain("consistency 3 7");
            expect(store.current).toEqual(r2.roster.logCheckpoint);
            expect(report.overall).toEqual({ outcome: "verified" });
        });

        it("reports a rollback when the served log is smaller than the pin and keeps the pin", async () => {
            const pinned = { merkleRoot: rootAt(7), size: 7 };
            const store = memoryStore(pinned);
            const report = await run({
                transport: stubTransport({ fetchRoster: async () => r1.roster }),
                config: authorityA,
                checkpoints: store,
            });

            expect(report.logConsistency).toEqual({ outcome: "rollback" });
            expect(report.overall).toEqual({ outcome: "failed", check: "logConsistency" });
            expect(store.current).toEqual(pinned);
        });

        it("reports inconsistent when a pin of the same size has another root", async () => {
            const store = memoryStore({ merkleRoot: rootAt(3), size: 7 });
            const report = await run({ checkpoints: store });

            expect(report.logConsistency).toEqual({ outcome: "inconsistent" });
            expect(store.current).toEqual({ merkleRoot: rootAt(3), size: 7 });
        });

        it("leaves the pin alone when the proof endpoint is not served", async () => {
            const pinned = { merkleRoot: rootAt(3), size: 3 };
            const store = memoryStore(pinned);
            const transport = stubTransport({
                fetchConsistency: async () => {
                    throw new Error("404");
                },
            });
            const report = await run({ transport, checkpoints: store });

            expect(report.logConsistency).toEqual(unverifiable(Reason.LogUnavailable));
            expect(store.current).toEqual(pinned);
        });

        it("keeps the larger pin when a concurrent slower run holds the smaller checkpoint", async () => {
            const store = memoryStore({ merkleRoot: rootAt(1), size: 1 });
            const lock = memoryLock();
            const keys = { ...config, authorityThreshold: 1 };
            let releaseProof = (): void => {};
            const slow = stubTransport({
                fetchRoster: async () => r1.roster,
                fetchConsistency: async (first, second) => {
                    await new Promise<void>((resolve) => (releaseProof = resolve));
                    return consistencyProof(first, second);
                },
            });
            const fast = stubTransport();

            const slowRun = run({ transport: slow, config: keys, checkpoints: store, lock });
            await until(() => slow.calls.includes("consistency 1 3"));
            const fastRun = run({ transport: fast, config: keys, checkpoints: store, lock });
            await new Promise((resolve) => setTimeout(resolve, 20));
            releaseProof();
            await Promise.all([slowRun, fastRun]);

            expect(store.current).toEqual(r2.roster.logCheckpoint);
            expect(fast.calls).toContain("consistency 3 7");
            const later = await run({
                transport: stubTransport({ fetchRoster: async () => r1.roster }),
                config: keys,
                checkpoints: store,
                lock,
            });
            expect(later.logConsistency).toEqual({ outcome: "rollback" });
        });

        it("reports storage_unavailable and leaves the pin alone without Web Locks", async () => {
            const pinned = { merkleRoot: rootAt(3), size: 3 };
            const store = memoryStore(pinned);
            const report = await run({ checkpoints: store, lock: null });

            expect(report.rosterSignature).toEqual({ outcome: "valid" });
            expect(report.logConsistency).toEqual(unverifiable(Reason.StorageUnavailable));
            expect(store.current).toEqual(pinned);
        });

        it("reports storage_unavailable instead of firstSeen when localStorage cannot be read", async () => {
            jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
                throw new DOMException("blocked", "SecurityError");
            });
            const setItem = jest.spyOn(Storage.prototype, "setItem");
            const report = await run({ checkpoints: localStorageCheckpointStore("https://resolver.example") });

            expect(report.logConsistency).toEqual(unverifiable(Reason.StorageUnavailable));
            expect(setItem).not.toHaveBeenCalled();
        });

        it("reports a stored pin that does not parse as storage_unavailable and leaves it in place", async () => {
            const key = "gua_resolver_log_checkpoint:https://resolver.example";
            window.localStorage.setItem(key, "{not json");
            const report = await run({ checkpoints: localStorageCheckpointStore("https://resolver.example") });

            expect(report.logConsistency).toEqual(unverifiable(Reason.StorageUnavailable));
            expect(window.localStorage.getItem(key)).toBe("{not json");
        });

        it("reports a stored pin whose size passes 2^31 as storage_unavailable", async () => {
            const key = "gua_resolver_log_checkpoint:https://resolver.example";
            window.localStorage.setItem(key, JSON.stringify({ merkleRoot: rootAt(7), size: 2 ** 32 }));
            const report = await run({ checkpoints: localStorageCheckpointStore("https://resolver.example") });

            expect(report.logConsistency).toEqual(unverifiable(Reason.StorageUnavailable));
        });

        it("reports storage_unavailable instead of firstSeen when localStorage cannot be written", async () => {
            jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
                throw new DOMException("full", "QuotaExceededError");
            });
            const report = await run({ checkpoints: localStorageCheckpointStore("https://resolver.example") });

            expect(report.logConsistency).toEqual(unverifiable(Reason.StorageUnavailable));
        });
    });

    describe("policy", () => {
        const noPolicy = (overrides: Partial<VerifierTransport> = {}): StubTransport =>
            stubTransport({ fetchRoutingPolicy: async () => NOT_FOUND, ...overrides });

        it("reports notPresent for a 404 when the signed log has published no policy", async () => {
            // r1's checkpoint covers the first three leaves, none of them a POLICY_PUBLISH.
            const transport = noPolicy({ fetchRoster: async () => r1.roster });
            const report = await run({ transport, config: authorityA });

            expect(report.policy).toEqual({ outcome: "notPresent" });
            expect(report.placement).toEqual({ outcome: "match" });
            expect(report.overall).toEqual({ outcome: "verified" });
            expect(transport.calls).toContain("log");
        });

        it("reports a 404 as policy_not_served when the signed log has published a policy", async () => {
            const report = await run({ transport: noPolicy() });

            expect(report.policy).toEqual(unverifiable(Reason.PolicyNotServed));
            expect(report.placement).toEqual(unverifiable(Reason.PolicyUnverified));
        });

        it("reports a 404 as log_unavailable when the log cannot be fetched", async () => {
            const transport = noPolicy({
                fetchLog: async () => {
                    throw new Error("404");
                },
            });
            const report = await run({ transport });

            expect(report.policy).toEqual(unverifiable(Reason.LogUnavailable));
        });

        it("reports a 404 as log_mismatch when the log does not hash to the signed root", async () => {
            const [first, second, ...rest] = vectors.log.events;
            const report = await run({
                transport: noPolicy({ fetchLog: async () => ({ events: [second, first, ...rest] }) }),
            });

            expect(report.policy).toEqual(invalid(Reason.LogMismatch));
        });

        it("reports a 404 as log_too_large without fetching the log past 4,096 leaves", async () => {
            const served = await signedRoster({
                ...copy(r2.roster),
                logCheckpoint: { merkleRoot: rootAt(7), size: 4097 },
            });
            const transport = noPolicy({ fetchRoster: async () => served });
            const report = await run({ transport, config: authorityA });

            expect(report.policy).toEqual(unverifiable(Reason.LogTooLarge));
            expect(transport.calls).not.toContain("log");
        });

        it("verifies a served policy against the policy keys and the log", async () => {
            const transport = stubTransport();
            const report = await run({ transport });

            expect(report.policy).toEqual({ outcome: "valid" });
            expect(report.placement).toEqual({ outcome: "match" });
            expect(report.overall).toEqual({ outcome: "verified" });
            expect(transport.calls).toEqual(["roster", "policy", "log"]);
        });

        it("refuses a policy signed by a key outside the policy keys, with no fallback to the authority keys", async () => {
            const untrusted = byName(vectors.policyRejections, "signed by the roster authority key").bundle;
            const report = await run({ transport: stubTransport({ fetchRoutingPolicy: async () => untrusted }) });

            expect(report.policy).toEqual(invalid(Reason.UnknownKeyId));
            expect(report.placement).toEqual(unverifiable(Reason.PolicyUnverified));
            expect(report.overall).toEqual({ outcome: "failed", check: "policy" });
        });

        it("reports the policy unverifiable when no policy keys are configured", async () => {
            const report = await run({ config: { ...config, policyKeys: [] } });

            expect(report.policy).toEqual(unverifiable(Reason.NoPolicyKeys));
            expect(report.placement).toEqual(unverifiable(Reason.PolicyUnverified));
        });

        it("refuses a bundle at its expiresAt before fetching the log", async () => {
            const transport = stubTransport();
            const report = await run({ transport, now: () => Date.parse("2030-01-01T00:00:00Z") });

            expect(report.policy).toEqual(invalid(Reason.OutsideWindow));
            expect(report.placement).toEqual(unverifiable(Reason.PolicyUnverified));
            expect(transport.calls).not.toContain("log");
        });

        it("reports log_too_large without fetching the log when the checkpoint covers more than 4,096 leaves", async () => {
            const served = await signedRoster({
                ...copy(r2.roster),
                logCheckpoint: { merkleRoot: rootAt(7), size: 4097 },
            });
            const transport = stubTransport({ fetchRoster: async () => served });
            const report = await run({ transport, config: authorityA });

            expect(report.policy).toEqual(unverifiable(Reason.LogTooLarge));
            expect(transport.calls).not.toContain("log");
        });

        it("reports the policy unverifiable when the log is not served", async () => {
            const transport = stubTransport({
                fetchLog: async () => {
                    throw new Error("404");
                },
            });
            const report = await run({ transport });

            expect(report.policy).toEqual(unverifiable(Reason.LogUnavailable));
        });

        it("reports a 200 whose policy body is null as parse_error, not as a 404", async () => {
            const report = await run({ transport: stubTransport({ fetchRoutingPolicy: async () => null }) });

            expect(report.policy).toEqual(unverifiable(Reason.ParseError));
        });

        it("reports a policy whose fallback enabled flag is a string as parse_error", async () => {
            const bundle = copy(policy.bundle);
            bundle.fallback.enabled = "true";
            const report = await run({ transport: stubTransport({ fetchRoutingPolicy: async () => bundle }) });

            expect(report.policy).toEqual(unverifiable(Reason.ParseError));
        });

        it("reports parse_error for a log with a null event", async () => {
            const report = await run({ transport: stubTransport({ fetchLog: async () => ({ events: [null] }) }) });

            expect(report.policy).toEqual(unverifiable(Reason.ParseError));
        });

        it("reports parse_error for a log event index past 2^31", async () => {
            const events = copy(vectors.log.events);
            events[7].index = 2 ** 32;
            const report = await run({ transport: stubTransport({ fetchLog: async () => ({ events }) }) });

            expect(report.policy).toEqual(unverifiable(Reason.ParseError));
        });

        it("hashes the log in served order, so swapped events do not match the signed root", async () => {
            const [first, second, ...rest] = vectors.log.events;
            const report = await run({
                transport: stubTransport({ fetchLog: async () => ({ events: [second, first, ...rest] }) }),
            });

            expect(report.policy).toEqual(invalid(Reason.LogMismatch));
        });

        it("reports a policy published after the signed checkpoint as policy_newer_than_checkpoint", async () => {
            // r1's checkpoint covers the first three leaves; the policy's leaf is the fourth.
            const report = await run({
                transport: stubTransport({ fetchRoster: async () => r1.roster }),
                config: authorityA,
            });

            expect(report.policy).toEqual(unverifiable(Reason.PolicyNewerThanCheckpoint));
            expect(report.placement).toEqual(unverifiable(Reason.PolicyUnverified));
        });

        it("reports a signed policy that the log never published as policy_not_logged", async () => {
            const bundle: Json = { ...copy(policy.bundle), version: 5 };
            const signature = await sign("rfc8032-test3", canonicalPolicyBytes(parseRoutingPolicy(bundle)));
            bundle.signatures = [{ authorityKeyId: "governance-a", signatureB64: signature }];
            const report = await run({ transport: stubTransport({ fetchRoutingPolicy: async () => bundle }) });

            expect(report.policy).toEqual(invalid(Reason.PolicyNotLogged));
        });

        it("reports policy_superseded when the signed log has published a later version of the policy", async () => {
            // The eighth leaf publishes br-policy:v4; r2's checkpoint stops before it, this one covers it.
            const served = await signedRoster({
                ...copy(r2.roster),
                logCheckpoint: { merkleRoot: rootAt(8), size: 8 },
            });
            const report = await run({
                transport: stubTransport({ fetchRoster: async () => served }),
                config: authorityA,
            });

            expect(report.policy).toEqual(unverifiable(Reason.PolicySuperseded));
            expect(report.placement).toEqual(unverifiable(Reason.PolicyUnverified));
        });

        it("leaves a zone whose delegate key the browser refuses unverified and the policy valid", async () => {
            const delegateKey = policy.bundle.delegationZones.find((z: Json) => z.id === "sp-zone").delegatePublicKey;
            const report = await run({ crypto: new VerifierCrypto(refusingSubtle(isKey(delegateKey))) });

            expect(report.policy).toEqual({ outcome: "valid" });
            expect(report.placement).toEqual({ outcome: "indeterminate", reason: Reason.UnsignedRule });
        });
    });

    describe("placement", () => {
        it("reports an existing account indeterminate even when the reproduction would match", async () => {
            const report = await run({ resolution: { ...brAnswer, exists: true } });

            expect(report.placement).toEqual({ outcome: "indeterminate", reason: Reason.ExistingAccount });
            expect(report.overall).toEqual({ outcome: "unverifiable", check: "placement" });
        });

        it("treats an answer without exists as an existing account", async () => {
            const report = await run({ resolution: { homeserver: br } });

            expect(report.placement).toEqual({ outcome: "indeterminate", reason: Reason.ExistingAccount });
        });

        it("reports a different placement as mismatch when the answer names the verified roster version", async () => {
            const report = await run({ resolution: { ...caAnswer, rosterVersion: 7 } });

            expect(report.placement).toEqual({ outcome: "mismatch" });
            expect(report.overall).toEqual({ outcome: "failed", check: "placement" });
        });

        it("reports a different placement as unattributed when the answer names another roster version", async () => {
            const report = await run({ resolution: { ...caAnswer, rosterVersion: 6 } });

            expect(report.placement).toEqual({ outcome: "indeterminate", reason: Reason.Unattributed });
        });

        it("reports a different placement as unattributed when the answer names no roster version", async () => {
            const report = await run({ resolution: caAnswer });

            expect(report.placement).toEqual({ outcome: "indeterminate", reason: Reason.Unattributed });
        });

        it("reports unsigned_rule when a matching rule whose zone lost its delegate signature ranks above", async () => {
            // Without the sp-zone rule the fallback places this phone on hs-ca, which is the answer.
            const stripped = byRef(vectors.policies, "br-policy v3 without the sp-zone delegate signature").bundle;
            const transport = stubTransport({ fetchRoutingPolicy: async () => stripped });
            const report = await run({ transport, resolution: { ...caAnswer, rosterVersion: 7 } });

            expect(report.policy).toEqual({ outcome: "valid" });
            expect(report.placement).toEqual({ outcome: "indeterminate", reason: Reason.UnsignedRule });
        });

        describe("unsigned rules", () => {
            const roster = parseSignedRoster(r2.roster);
            const unsignedRule = { ...policy.bundle.rules[0], matchValue: "+55", delegatedZoneId: "na-zone" };

            async function placementWith(rule: Json): Promise<Placement> {
                const bundle = parseRoutingPolicy({ ...policy.bundle, rules: [...policy.bundle.rules, rule] });
                const verified = { bundle, delegateVerifiedZones: new Set(["sp-zone", "edu-zone"]) };
                return reproducePlacement(new VerifierCrypto(), phoneContext(PHONE), roster, verified, NOW);
            }

            it("ignores one ranked below the rule that decided", async () => {
                const placement = await placementWith({ ...unsignedRule, id: "r-low", priority: 20 });

                expect(placement.decision?.ruleId).toBe("r-sp");
                expect(placement.unsignedRuleAbove).toBe(false);
            });

            it("ranks one of equal priority by id", async () => {
                const placement = await placementWith({ ...unsignedRule, id: "r-a", priority: 10 });

                expect(placement.decision?.ruleId).toBe("r-sp");
                expect(placement.unsignedRuleAbove).toBe(true);
            });

            it("ranks a rule without an id after the others of its priority, as the signed bytes do", async () => {
                const rule = {
                    ...unsignedRule,
                    id: null,
                    priority: 10,
                    delegatedZoneId: "sp-zone",
                    targetHomeserverId: "hs-ca",
                };
                const placement = await placementWith(rule);

                expect(placement.decision?.ruleId).toBe("r-sp");
            });
        });
    });

    describe("report", () => {
        it("logs one line in the contract format, with no phone, URL or server name", async () => {
            await run();

            expect(logger.info).toHaveBeenCalledTimes(1);
            expect(jest.mocked(logger.info).mock.calls[0]).toEqual([
                expect.stringMatching(
                    /^Resolver verification environment=dev rosterVersion=7 rosterForm=v1 rosterSignature=valid homeserverMatch=ACTIVE_MATCH memberEntry=valid logConsistency=firstSeen policy=valid placement=match overall=verified durationMs=\d+$/,
                ),
            ]);
        });

        it("writes reasons and the overall check in parentheses and none for an unread roster", async () => {
            await run({ config: { ...config, authorityKeys: [], environment: "unknown" } });

            expect(jest.mocked(logger.info).mock.calls[0][0]).toMatch(
                /^Resolver verification environment=unknown rosterVersion=none rosterForm=none rosterSignature=unverifiable\(no_trust_roots\) .* overall=unverifiable\(rosterSignature\) durationMs=\d+$/,
            );
        });
    });

    describe("stages", () => {
        it("verifies the roster, log and policy when prepared, before any answer", async () => {
            const transport = stubTransport();
            verifier({ transport }).prepare();

            await until(() => transport.calls.includes("log"));
            expect(transport.calls).toEqual(["roster", "policy", "log"]);
            expect(logger.info).not.toHaveBeenCalled();
        });

        it("checks each answer against the prepared artifacts without fetching them again", async () => {
            const transport = stubTransport();
            const verification = verifier({ transport });
            verification.prepare();

            const first = await verification.verify(brAnswer, PHONE);
            const second = await verification.verify(caAnswer, PHONE);

            expect(first.placement).toEqual({ outcome: "match" });
            expect(second.placement).toEqual({ outcome: "indeterminate", reason: Reason.Unattributed });
            expect(transport.calls.filter((c) => c === "roster")).toHaveLength(1);
            expect(logger.info).toHaveBeenCalledTimes(2);
        });

        describe("refreshing the artifacts", () => {
            const rosterFetches = (transport: StubTransport): number =>
                transport.calls.filter((c) => c === "roster").length;
            const pause = (ms = 0): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, ms));
            const hang = (signal?: AbortSignal): Promise<unknown> =>
                new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));

            /** A verification whose first run has settled, on a wall clock the test moves. */
            async function settled(
                transport: StubTransport,
                options: Partial<VerifierOptions> = {},
            ): Promise<{ verification: ResolverVerification; advance: (ms: number) => void }> {
                let clock = NOW;
                const verification = verifier({ transport, now: () => clock, ...options });
                await verification.verify(brAnswer, PHONE);
                await pause();
                return { verification, advance: (ms) => (clock += ms) };
            }

            it("keeps the run when prepared again within five minutes of it settling", async () => {
                const transport = stubTransport();
                const { verification, advance } = await settled(transport);

                advance(5 * 60_000);
                verification.prepare();
                // A new run would reach /roster only after importing the keys.
                await pause(50);

                expect(rosterFetches(transport)).toBe(1);
            });

            it("starts a new run when prepared again more than five minutes after it settled", async () => {
                const transport = stubTransport();
                const { verification, advance } = await settled(transport);

                advance(5 * 60_000 + 1);
                verification.prepare();

                await until(() => rosterFetches(transport) === 2);
            });

            it("starts a new run when prepared again after one that timed out", async () => {
                const transport = stubTransport({
                    fetchRoster: (signal) =>
                        rosterFetches(transport) === 1 ? hang(signal) : Promise.resolve(r2.roster),
                });
                const verification = verifier({ transport, budgetMs: 50 });
                verification.prepare();
                await pause(100);

                verification.prepare();

                await until(() => rosterFetches(transport) === 2);
            });

            it("starts a new run when prepared again after the roster could not be fetched", async () => {
                const transport = stubTransport({
                    fetchRoster: async () => {
                        if (rosterFetches(transport) === 1) throw new Error("network");
                        return r2.roster;
                    },
                });
                const { verification } = await settled(transport);

                verification.prepare();
                const report = await verification.verify(brAnswer, PHONE);

                expect(report.rosterSignature).toEqual({ outcome: "valid" });
            });

            it("starts a new run for an answer when the current one timed out", async () => {
                const transport = stubTransport({
                    fetchRoster: (signal) =>
                        rosterFetches(transport) === 1 ? hang(signal) : Promise.resolve(r2.roster),
                });
                const verification = verifier({ transport, budgetMs: 50 });
                verification.prepare();
                await pause(100);

                const report = await verification.verify(brAnswer, PHONE);

                expect(rosterFetches(transport)).toBe(2);
                expect(report.rosterSignature).toEqual({ outcome: "valid" });
            });

            it("checks an answer against the current run however long ago it settled", async () => {
                const transport = stubTransport();
                const { verification, advance } = await settled(transport);

                advance(60 * 60_000);
                await verification.verify(brAnswer, PHONE);

                expect(rosterFetches(transport)).toBe(1);
            });

            it("checks an answer against the last settled run until its refresh settles", async () => {
                let release = (): void => {};
                const transport = stubTransport({
                    fetchRoster: () =>
                        rosterFetches(transport) === 1
                            ? Promise.resolve(r2.roster)
                            : new Promise((resolve) => (release = () => resolve(r1.roster))),
                });
                const options = { config: { ...config, authorityThreshold: 1 }, budgetMs: 500 };
                const { verification, advance } = await settled(transport, options);
                advance(5 * 60_000 + 1);
                verification.prepare();
                await until(() => rosterFetches(transport) === 2);

                const during = await verification.verify(brAnswer, PHONE);
                release();
                await until(() => transport.calls.filter((c) => c === "log").length === 2);
                await pause(20);
                const after = await verification.verify(brAnswer, PHONE);

                expect(during.rosterVersion).toBe(7);
                expect(after.rosterVersion).toBe(3);
            });
        });

        it("logs a pending report at flush with unsettled checks as timeout, and only that one", async () => {
            let releaseRoster = (_roster: unknown): void => {};
            const transport = stubTransport({ fetchRoster: () => new Promise((resolve) => (releaseRoster = resolve)) });
            const verification = verifier({ transport });
            const pending = verification.verify(caAnswer, PHONE);
            await until(() => transport.calls.includes("roster"));

            verification.flush();
            expect(logger.info).toHaveBeenCalledTimes(1);
            expect(jest.mocked(logger.info).mock.calls[0][0]).toContain(
                "rosterSignature=unverifiable(timeout) homeserverMatch=unverifiable(roster_unverified)",
            );

            releaseRoster(r2.roster);
            const report = await pending;
            expect(report).toMatchObject(rosterFailure(Reason.Timeout));
            expect(logger.info).toHaveBeenCalledTimes(1);
        });

        it("never rejects into the caller, even when the transport throws synchronously", async () => {
            const transport = stubTransport({
                fetchRoster: () => {
                    throw new Error("synchronous fault");
                },
            });
            const report = await run({ transport });

            expect(report.rosterSignature).toEqual(unverifiable(Reason.RosterUnavailable));
        });
    });

    describe("configuration", () => {
        const keys = [{ id: "authority-a", public_key: r1.trustedKeys[0].publicKeySpkiB64 }];

        it("reads no trust roots, threshold one and environment unknown without a verification block", () => {
            SdkConfig.add({ gua_resolver: { base_url: "https://resolver.example" } });

            expect(readVerificationConfig()).toEqual({
                environment: "unknown",
                authorityKeys: [],
                authorityThreshold: 1,
                policyKeys: [],
                policyThreshold: 1,
            });
        });

        it("reads the trust roots and the environment from the snake_case config block", () => {
            SdkConfig.add({
                gua_resolver: {
                    base_url: "https://resolver.example",
                    verification: {
                        mode: "report",
                        environment: "prod",
                        authority_keys: [{ id: "gua-authority-prod", public_key: "spki" }],
                        authority_threshold: 2,
                        policy_keys: [{ id: "gua-authority-prod", public_key: "spki" }],
                    },
                },
            });

            expect(readVerificationConfig()).toEqual({
                environment: "prod",
                authorityKeys: [{ id: "gua-authority-prod", publicKey: "spki" }],
                authorityThreshold: 2,
                policyKeys: [{ id: "gua-authority-prod", publicKey: "spki" }],
                policyThreshold: 1,
            });
        });

        it("labels any other environment value unknown", () => {
            SdkConfig.add({
                gua_resolver: {
                    base_url: "https://resolver.example",
                    verification: { environment: "staging" as "dev", authority_keys: keys },
                },
            });

            expect(readVerificationConfig().environment).toBe("unknown");
        });

        it("drops a key entry without a public key and keeps the rest", () => {
            SdkConfig.add({
                gua_resolver: {
                    base_url: "https://resolver.example",
                    verification: {
                        authority_keys: [{ id: "broken" } as { id: string; public_key: string }, ...keys],
                        authority_threshold: 0,
                    },
                },
            });

            expect(readVerificationConfig()).toMatchObject({
                authorityKeys: [{ id: "authority-a", publicKey: keys[0].public_key }],
                authorityThreshold: 1,
            });
        });

        it("builds no verifier without a resolver or with verification off", () => {
            expect(ResolverVerification.fromConfig()).toBeNull();
            SdkConfig.add({
                gua_resolver: {
                    base_url: "https://resolver.example",
                    verification: { mode: "off", authority_keys: keys },
                },
            });
            expect(ResolverVerification.fromConfig()).toBeNull();
        });

        it("builds a verifier when a resolver is configured", () => {
            SdkConfig.add({
                gua_resolver: { base_url: "https://resolver.example", verification: { authority_keys: keys } },
            });

            expect(ResolverVerification.fromConfig()).toBeInstanceOf(ResolverVerification);
        });
    });

    describe("localStorageCheckpointStore", () => {
        it("round-trips a checkpoint per resolver base URL", () => {
            const store = localStorageCheckpointStore("https://resolver.example");
            expect(store.load()).toBeNull();
            store.save({ merkleRoot: rootAt(3), size: 3 });
            expect(store.load()).toEqual({ merkleRoot: rootAt(3), size: 3 });
            expect(localStorageCheckpointStore("https://other.example").load()).toBeNull();
        });

        it("throws for a stored value that does not read back as a pin", () => {
            window.localStorage.setItem("gua_resolver_log_checkpoint:https://resolver.example", "{not json");
            expect(() => localStorageCheckpointStore("https://resolver.example").load()).toThrow();
        });
    });
});
