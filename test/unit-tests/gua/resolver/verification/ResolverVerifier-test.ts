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
import { type ValidatedServerConfig } from "../../../../../src/utils/ValidatedServerConfig";
import ResolverClient, { type HomeserverResolution } from "../../../../../src/gua/resolver/ResolverClient";
import { type LogCheckpoint } from "../../../../../src/gua/resolver/verification/canonical";
import {
    type CheckpointStore,
    localStorageCheckpointStore,
} from "../../../../../src/gua/resolver/verification/checkpointStore";
import { type TrustedKey } from "../../../../../src/gua/resolver/verification/ed25519";
import {
    lastResolverVerificationReport,
    readVerificationConfig,
    type ResolverVerificationConfig,
    startResolverVerification,
    type VerificationInput,
    type VerifierTransport,
    verifyResolution,
} from "../../../../../src/gua/resolver/verification/ResolverVerifier";

// jsdom has no SubtleCrypto; the verifier reads globalThis.crypto.subtle exactly as a browser would.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

interface TrustedKeyVector {
    id: string;
    publicKeySpkiB64: string;
}

interface RosterVector {
    roster: { logCheckpoint: LogCheckpoint };
    trustedKeys: TrustedKeyVector[];
    threshold: number;
}

interface Vectors {
    rosters: RosterVector[];
    rosterRejections: { name: string; roster: unknown }[];
    log: {
        events: unknown[];
        roots: { size: number; rootHex: string }[];
        consistencyProofs: { first: number; second: number; proof: string[] }[];
    };
    policies: { bundle: unknown; trustedKeys: TrustedKeyVector[]; threshold: number }[];
    policyRejections: { name: string; bundle: unknown }[];
}

const vectors: Vectors = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "gua-client-verification-v1-vectors.json"), "utf8"),
);
const r1 = vectors.rosters[0];
const r2 = vectors.rosters[1];
const policy = vectors.policies[0];
const mixedRoster = vectors.rosterRejections.find((r) => r.name.startsWith("mixed"))!.roster;
const untrustedPolicy = vectors.policyRejections.find((r) => r.name.startsWith("signed by the operational"))!.bundle;

const PHONE = "+5511987654321";
const NOW = Date.parse("2026-10-27T00:00:00Z");

const brAnswer: HomeserverResolution = {
    exists: false,
    homeserver: {
        serverName: "br.gua.test",
        baseUrl: "https://matrix.br.gua.test",
        masIssuer: "https://account.br.gua.test",
    },
};
const caAnswer: HomeserverResolution = {
    exists: false,
    homeserver: {
        serverName: "ca.gua.test",
        baseUrl: "https://matrix.ca.gua.test",
        masIssuer: "https://account.ca.gua.test",
    },
};

function trustedKeys(list: TrustedKeyVector[]): TrustedKey[] {
    return list.map((k) => ({ id: k.id, publicKey: k.publicKeySpkiB64 }));
}

const config: ResolverVerificationConfig = {
    mode: "report",
    authorityKeys: trustedKeys(r2.trustedKeys),
    authorityThreshold: r2.threshold,
    policyKeys: trustedKeys(policy.trustedKeys),
    policyThreshold: policy.threshold,
};

function rootAt(size: number): string {
    return vectors.log.roots.find((r) => r.size === size)!.rootHex;
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

interface StubTransport extends VerifierTransport {
    calls: string[];
}

/** Serves roster r2, the full log and no policy unless overridden; every call is recorded by name. */
function stubTransport(overrides: Partial<VerifierTransport> = {}): StubTransport {
    const calls: string[] = [];
    const impl: VerifierTransport = {
        fetchRoster: async () => r2.roster,
        fetchLog: async () => ({ head: r2.roster.logCheckpoint, events: vectors.log.events }),
        fetchConsistency: async (first, second) => {
            const proof = vectors.log.consistencyProofs.find((p) => p.first === first && p.second === second);
            if (!proof) throw new Error(`no proof vector for ${first} to ${second}`);
            return { first, second, proof: proof.proof };
        },
        fetchRoutingPolicy: async () => null,
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

function run(input: Partial<VerificationInput> = {}): ReturnType<typeof verifyResolution> {
    return verifyResolution({
        transport: stubTransport(),
        config,
        resolution: brAnswer,
        phone: PHONE,
        checkpoints: memoryStore(),
        environment: "test",
        now: () => NOW,
        ...input,
    });
}

function unverifiable(reason: string): { outcome: string; reason: string } {
    return { outcome: "unverifiable", reason };
}

async function until(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !condition(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(condition()).toBe(true);
}

describe("ResolverVerifier", () => {
    beforeEach(() => {
        jest.spyOn(logger, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        SdkConfig.reset();
        window.localStorage.clear();
    });

    it("reports every check unverifiable(no_trust_roots) and fetches nothing when no keys are configured", async () => {
        const transport = stubTransport();
        const report = await run({ transport, config: { ...config, authorityKeys: [] } });

        expect(report.rosterSignature).toEqual(unverifiable("no_trust_roots"));
        expect(report.homeserverMatch).toEqual(unverifiable("no_trust_roots"));
        expect(report.memberEntry).toEqual(unverifiable("no_trust_roots"));
        expect(report.logConsistency).toEqual(unverifiable("no_trust_roots"));
        expect(report.policy).toEqual(unverifiable("no_trust_roots"));
        expect(report.placement).toEqual(unverifiable("no_trust_roots"));
        expect(report.overall).toEqual({ outcome: "unverifiable", check: "rosterSignature" });
        expect(transport.calls).toEqual([]);
    });

    it("treats keys that are not Ed25519 SPKI as no trust roots", async () => {
        const transport = stubTransport();
        const report = await run({
            transport,
            config: { ...config, authorityKeys: [{ id: "authority-a", publicKey: "bm90IGEga2V5" }] },
        });

        expect(report.rosterSignature).toEqual(unverifiable("no_trust_roots"));
        expect(transport.calls).toEqual([]);
    });

    it("reports crypto_unsupported without fetching when the browser has no SubtleCrypto", async () => {
        const transport = stubTransport();
        Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
        let report;
        try {
            report = await run({ transport });
        } finally {
            Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
        }

        expect(report.rosterSignature).toEqual(unverifiable("crypto_unsupported"));
        expect(report.placement).toEqual(unverifiable("crypto_unsupported"));
        expect(report.overall).toEqual({ outcome: "unverifiable", check: "rosterSignature" });
        expect(transport.calls).toEqual([]);
    });

    it("reports roster_unavailable for every check when the roster cannot be fetched", async () => {
        const store = memoryStore();
        const transport = stubTransport({
            fetchRoster: async () => {
                throw new Error("network");
            },
        });
        const report = await run({ transport, checkpoints: store });

        expect(report.rosterSignature).toEqual(unverifiable("roster_unavailable"));
        expect(report.logConsistency).toEqual(unverifiable("roster_unavailable"));
        expect(report.placement).toEqual(unverifiable("roster_unavailable"));
        expect(report.overall).toEqual({ outcome: "unverifiable", check: "rosterSignature" });
        expect(report.rosterVersion).toBeNull();
        expect(store.current).toBeNull();
        expect(transport.calls).toEqual(["roster"]);
    });

    it("reports roster_unavailable when the browser refuses the request, as a failed CORS preflight does", async () => {
        const realFetch = globalThis.fetch;
        globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        try {
            const report = await run({ transport: new ResolverClient("https://resolver.example") });
            expect(report.rosterSignature).toEqual(unverifiable("roster_unavailable"));
            expect(report.overall).toEqual({ outcome: "unverifiable", check: "rosterSignature" });
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it("gives up after the time budget with roster_unavailable", async () => {
        const transport = stubTransport({
            fetchRoster: (signal) =>
                new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")))),
        });
        const report = await run({ transport, budgetMs: 20 });

        expect(report.rosterSignature).toEqual(unverifiable("roster_unavailable"));
    });

    it("refuses a roster that mixes the two forms before any signature check", async () => {
        const report = await run({ transport: stubTransport({ fetchRoster: async () => mixedRoster }) });

        expect(report.rosterForm).toBe("mixed");
        expect(report.rosterVersion).toBe(7);
        expect(report.rosterSignature).toEqual(unverifiable("mixed_roster_form"));
        expect(report.homeserverMatch).toEqual(unverifiable("mixed_roster_form"));
        expect(report.overall).toEqual({ outcome: "unverifiable", check: "rosterSignature" });
    });

    it("reports a roster whose signatures do not meet the threshold as invalid", async () => {
        const report = await run({
            config: { ...config, authorityKeys: trustedKeys(r1.trustedKeys), authorityThreshold: 2 },
        });

        expect(report.rosterSignature).toEqual({ outcome: "invalid", reason: "threshold_not_met" });
        expect(report.homeserverMatch).toEqual(unverifiable("roster_unverified"));
        expect(report.overall).toEqual({ outcome: "failed", check: "rosterSignature" });
    });

    it("pins the first checkpoint it sees", async () => {
        const store = memoryStore();
        const report = await run({ checkpoints: store, resolution: caAnswer });

        expect(report.rosterSignature).toEqual({ outcome: "valid" });
        expect(report.rosterForm).toBe("v1");
        expect(report.rosterVersion).toBe(7);
        expect(report.logConsistency).toEqual({ outcome: "firstSeen" });
        expect(store.current).toEqual(r2.roster.logCheckpoint);
    });

    it("moves the pin forward after a verified consistency proof", async () => {
        const store = memoryStore({ merkleRoot: rootAt(3), size: 3 });
        const transport = stubTransport();
        const report = await run({ transport, checkpoints: store, resolution: caAnswer });

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
            config: { ...config, authorityKeys: trustedKeys(r1.trustedKeys), authorityThreshold: r1.threshold },
            checkpoints: store,
        });

        expect(report.rosterVersion).toBe(3);
        expect(report.logConsistency).toEqual({ outcome: "rollback" });
        expect(report.overall).toEqual({ outcome: "failed", check: "logConsistency" });
        expect(store.current).toEqual(pinned);
    });

    it("reports inconsistent when a pin of the same size has another root", async () => {
        const store = memoryStore({ merkleRoot: rootAt(3), size: 7 });
        const report = await run({ checkpoints: store, resolution: caAnswer });

        expect(report.logConsistency).toEqual({ outcome: "inconsistent" });
        expect(store.current).toEqual({ merkleRoot: rootAt(3), size: 7 });
    });

    it("leaves the pin alone when the proof endpoint is not served", async () => {
        const pinned = { merkleRoot: rootAt(3), size: 3 };
        const store = memoryStore(pinned);
        const report = await run({
            transport: stubTransport({
                fetchConsistency: async () => {
                    throw new Error("404");
                },
            }),
            checkpoints: store,
            resolution: caAnswer,
        });

        expect(report.logConsistency).toEqual(unverifiable("log_unavailable"));
        expect(report.overall).toEqual({ outcome: "unverifiable", check: "logConsistency" });
        expect(store.current).toEqual(pinned);
    });

    it("reports notPresent when the policy endpoint answers 404 and reproduces the roster-only placement", async () => {
        const report = await run({ resolution: caAnswer });

        expect(report.policy).toEqual({ outcome: "notPresent" });
        expect(report.placement).toEqual({ outcome: "match" });
        expect(report.memberEntry).toEqual({ outcome: "unattested" });
        expect(report.overall).toEqual({ outcome: "verified" });
    });

    it("verifies a served policy against the policy keys and the log, then reproduces the policy placement", async () => {
        const transport = stubTransport({ fetchRoutingPolicy: async () => policy.bundle });
        const report = await run({ transport });

        expect(report.rosterSignature).toEqual({ outcome: "valid" });
        expect(report.homeserverMatch).toEqual({ outcome: "ACTIVE_MATCH" });
        expect(report.memberEntry).toEqual({ outcome: "valid" });
        expect(report.policy).toEqual({ outcome: "valid" });
        expect(report.placement).toEqual({ outcome: "match" });
        expect(report.overall).toEqual({ outcome: "verified" });
        expect(transport.calls).toEqual(["roster", "policy", "log"]);
    });

    it("refuses a policy signed by a key outside the policy keys, with no fallback to the authority keys", async () => {
        const report = await run({ transport: stubTransport({ fetchRoutingPolicy: async () => untrustedPolicy }) });

        expect(report.policy).toEqual({ outcome: "invalid", reason: "unknown_key_id" });
        expect(report.placement).toEqual({ outcome: "notApplicable" });
        expect(report.overall).toEqual({ outcome: "failed", check: "policy" });
    });

    it("reports the policy unverifiable when no policy keys are configured", async () => {
        const report = await run({
            transport: stubTransport({ fetchRoutingPolicy: async () => policy.bundle }),
            config: { ...config, policyKeys: [] },
        });

        expect(report.policy).toEqual(unverifiable("no_policy_keys"));
        expect(report.placement).toEqual(unverifiable("policy_unverified"));
        expect(report.overall).toEqual({ outcome: "unverifiable", check: "policy" });
    });

    it("reports the policy unverifiable when the log is not served", async () => {
        const report = await run({
            transport: stubTransport({
                fetchRoutingPolicy: async () => policy.bundle,
                fetchLog: async () => {
                    throw new Error("404");
                },
            }),
        });

        expect(report.policy).toEqual(unverifiable("log_unavailable"));
    });

    it("refuses a policy whose POLICY_PUBLISH leaf lies past the signed checkpoint", async () => {
        // r1's checkpoint covers the first three leaves; the policy's leaf is the fourth.
        const report = await run({
            transport: stubTransport({
                fetchRoster: async () => r1.roster,
                fetchRoutingPolicy: async () => policy.bundle,
            }),
            config: { ...config, authorityKeys: trustedKeys(r1.trustedKeys), authorityThreshold: r1.threshold },
        });

        expect(report.rosterVersion).toBe(3);
        expect(report.rosterSignature).toEqual({ outcome: "valid" });
        expect(report.policy).toEqual({ outcome: "invalid", reason: "policy_not_logged" });
        expect(report.placement).toEqual({ outcome: "notApplicable" });
        expect(report.overall).toEqual({ outcome: "failed", check: "policy" });
    });

    it("fetches the artifacts before waiting on homeserver discovery", async () => {
        const transport = stubTransport({
            fetchRoutingPolicy: async (signal) => {
                if (signal?.aborted) throw new Error("aborted");
                return null;
            },
        });
        const report = await run({
            transport,
            resolution: caAnswer,
            discoveredIssuer: new Promise(() => {}),
            budgetMs: 50,
        });

        expect(report.homeserverMatch).toEqual({ outcome: "ACTIVE_MATCH" });
        expect(report.policy).toEqual({ outcome: "notPresent" });
        expect(report.placement).toEqual({ outcome: "match" });
        expect(report.overall).toEqual({ outcome: "verified" });
    });

    it("reports FIELD_MISMATCH for a known server name with another base URL", async () => {
        const report = await run({
            resolution: { exists: true, homeserver: { ...brAnswer.homeserver, baseUrl: "https://matrix.evil.test" } },
        });

        expect(report.homeserverMatch).toEqual({ outcome: "FIELD_MISMATCH" });
        expect(report.overall).toEqual({ outcome: "failed", check: "homeserverMatch" });
    });

    it("reports FIELD_MISMATCH when the discovered OIDC issuer differs from the roster entry", async () => {
        const report = await run({ discoveredIssuer: Promise.resolve("https://account.evil.test/") });

        expect(report.homeserverMatch).toEqual({ outcome: "FIELD_MISMATCH" });
    });

    it("accepts a discovered issuer that differs from the roster entry only by a trailing slash", async () => {
        const report = await run({ discoveredIssuer: Promise.resolve("https://account.br.gua.test/") });

        expect(report.homeserverMatch).toEqual({ outcome: "ACTIVE_MATCH" });
    });

    it("reports a placement the rules do not justify as mismatch only for a declared placement answer", async () => {
        const declared = await run();
        expect(declared.placement).toEqual({ outcome: "mismatch" });
        expect(declared.overall).toEqual({ outcome: "failed", check: "placement" });

        const existing = await run({ resolution: { ...brAnswer, exists: true } });
        expect(existing.placement).toEqual({ outcome: "indeterminate" });
        expect(existing.overall).toEqual({ outcome: "unverifiable", check: "placement" });

        const uniform = await run({ resolution: { homeserver: brAnswer.homeserver } });
        expect(uniform.placement).toEqual({ outcome: "indeterminate" });
    });

    it("logs outcome codes only, never the phone or the homeserver", async () => {
        const info = jest.spyOn(logger, "info").mockImplementation(() => {});
        await run({ transport: stubTransport({ fetchRoutingPolicy: async () => policy.bundle }) });

        expect(info).toHaveBeenCalledTimes(1);
        const logged = JSON.stringify(info.mock.calls[0]);
        expect(logged).toContain('"overall":"verified"');
        expect(logged).toContain('"rosterVersion":7');
        expect(logged).not.toContain(PHONE);
        expect(logged).not.toContain("gua.test");
        expect(lastResolverVerificationReport()?.overall).toEqual({ outcome: "verified" });
    });

    describe("configuration", () => {
        it("is inert when config.json carries no verification block", () => {
            SdkConfig.add({ gua_resolver: { base_url: "https://resolver.example" } });

            expect(readVerificationConfig()).toEqual({
                mode: "report",
                authorityKeys: [],
                authorityThreshold: 1,
                policyKeys: [],
                policyThreshold: 1,
            });
        });

        it("reads the trust roots from the snake_case config block", () => {
            SdkConfig.add({
                gua_resolver: {
                    base_url: "https://resolver.example",
                    verification: {
                        mode: "report",
                        authority_keys: [{ id: "gua-authority-prod", public_key: "spki" }],
                        authority_threshold: 2,
                        policy_keys: [{ id: "gua-authority-prod", public_key: "spki" }],
                    },
                },
            });

            expect(readVerificationConfig()).toEqual({
                mode: "report",
                authorityKeys: [{ id: "gua-authority-prod", publicKey: "spki" }],
                authorityThreshold: 2,
                policyKeys: [{ id: "gua-authority-prod", publicKey: "spki" }],
                policyThreshold: 1,
            });
        });

        it("drops a key entry without a public key and keeps the rest", () => {
            SdkConfig.add({
                gua_resolver: {
                    base_url: "https://resolver.example",
                    verification: {
                        authority_keys: [
                            { id: "broken" } as { id: string; public_key: string },
                            { id: "gua-authority-prod", public_key: "spki" },
                        ],
                        authority_threshold: 0,
                    },
                },
            });

            expect(readVerificationConfig()).toEqual({
                mode: "report",
                authorityKeys: [{ id: "gua-authority-prod", publicKey: "spki" }],
                authorityThreshold: 1,
                policyKeys: [],
                policyThreshold: 1,
            });
        });
    });

    describe("startResolverVerification", () => {
        function configure(mode: "off" | "report"): void {
            SdkConfig.add({
                gua_resolver: {
                    base_url: "https://resolver.example",
                    verification: {
                        mode,
                        authority_keys: r2.trustedKeys.map((k) => ({ id: k.id, public_key: k.publicKeySpkiB64 })),
                        authority_threshold: r2.threshold,
                        policy_keys: policy.trustedKeys.map((k) => ({ id: k.id, public_key: k.publicKeySpkiB64 })),
                    },
                },
            });
        }

        const discovered = {
            hsUrl: "https://matrix.br.gua.test",
            delegatedAuthentication: { issuer: "https://account.br.gua.test/" },
        } as unknown as ValidatedServerConfig;

        it("returns the resolution to the caller before the verification has finished", async () => {
            configure("report");
            let releaseRoster: (roster: unknown) => void = () => {};
            let requested = false;
            const transport = stubTransport({
                fetchRoster: () => {
                    requested = true;
                    return new Promise((resolve) => {
                        releaseRoster = resolve;
                    });
                },
            });
            const before = lastResolverVerificationReport();
            const discovery = Promise.resolve(discovered);

            startResolverVerification(
                { ...transport, baseUrl: "https://resolver.example" },
                brAnswer,
                PHONE,
                discovery,
            );
            await discovery;
            expect(lastResolverVerificationReport()).toBe(before);

            await until(() => requested);
            expect(lastResolverVerificationReport()).toBe(before);

            releaseRoster(r2.roster);
            await until(() => lastResolverVerificationReport() !== before);

            const report = lastResolverVerificationReport();
            expect(report?.environment).toBe("authority-a");
            expect(report?.homeserverMatch).toEqual({ outcome: "ACTIVE_MATCH" });
            expect(localStorageCheckpointStore("https://resolver.example").load()).toEqual(r2.roster.logCheckpoint);
        });

        it("does nothing when the mode is off", async () => {
            configure("off");
            const transport = stubTransport();

            startResolverVerification(
                { ...transport, baseUrl: "https://resolver.example" },
                brAnswer,
                PHONE,
                Promise.resolve(discovered),
            );
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(transport.calls).toEqual([]);
        });

        it("never throws into the caller", async () => {
            configure("report");
            const before = lastResolverVerificationReport();
            const transport = stubTransport({
                fetchRoster: () => {
                    throw new Error("synchronous fault");
                },
            });

            expect(() =>
                startResolverVerification(
                    { ...transport, baseUrl: "https://resolver.example" },
                    brAnswer,
                    PHONE,
                    Promise.reject(new Error("discovery failed")),
                ),
            ).not.toThrow();

            await until(() => lastResolverVerificationReport() !== before);
            expect(lastResolverVerificationReport()?.rosterSignature).toEqual(unverifiable("roster_unavailable"));
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

        it("treats an unreadable value as no pin", () => {
            window.localStorage.setItem("gua_resolver_log_checkpoint:https://resolver.example", "{not json");
            expect(localStorageCheckpointStore("https://resolver.example").load()).toBeNull();
        });
    });
});
