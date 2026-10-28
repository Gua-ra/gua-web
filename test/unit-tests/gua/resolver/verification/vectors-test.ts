/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    canonicalRosterBytes,
    canonicalRosterText,
    detectRosterForm,
    instantToEpochMs,
    locateHomeserver,
    parseInstant,
    parseSignedRoster,
} from "../../../../../src/gua/resolver/verification/canonical";
import {
    bytesToHex,
    decodeEd25519Spki,
    ED25519_SPKI_PREFIX_HEX,
    type TrustedKey,
    TrustedKeySet,
    VerifierCrypto,
} from "../../../../../src/gua/resolver/verification/ed25519";
import { LengthPrefixedEncoder } from "../../../../../src/gua/resolver/verification/lengthPrefixed";
import {
    memberEntryBytes,
    MemberEntryVerifier,
    parseMemberBlock,
    type MemberHomeserver,
    type PriorMemberEntry,
} from "../../../../../src/gua/resolver/verification/memberEntry";
import { MerkleTree } from "../../../../../src/gua/resolver/verification/merkle";
import {
    type PlacementContext,
    placementCandidates,
    reproducePlacement,
    routingKey,
    stableHash,
    type VerifiedPolicy,
} from "../../../../../src/gua/resolver/verification/placement";
import {
    canonicalDelegatedRulesBytes,
    canonicalPolicyBytes,
    canonicalPolicyText,
    parseRoutingPolicy,
    PolicyVerifier,
} from "../../../../../src/gua/resolver/verification/policy";

// jsdom has no SubtleCrypto; the verifier reads globalThis.crypto.subtle exactly as a browser would.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

interface KeyVector {
    name: string;
    usedAsKeyId?: string;
    seedHex?: string;
    publicKeyHex: string;
    publicKeySpkiB64: string;
    privateKeyPkcs8B64?: string;
}

interface TrustedKeyVector {
    id: string;
    publicKeySpkiB64: string;
}

interface RosterVector {
    name: string;
    form: "v1" | "legacy" | "mixed";
    roster: unknown;
    canonicalUtf8: string;
    canonicalHex: string;
    sha256Hex: string;
    trustedKeys: TrustedKeyVector[];
    threshold: number;
    validSignatures: number;
    verified: boolean;
    clientOnly?: boolean;
}

interface LogEventVector {
    index: number;
    type: string;
    homeserverId: string | null;
    payloadHash: string;
    recordedAt: string;
    leafDataUtf8: string;
    leafHashHex: string;
}

interface ConsistencyVector {
    name?: string;
    first: number;
    second: number;
    oldRootHex: string;
    newRootHex: string;
    proof: string[];
    valid: boolean;
}

interface PolicyVector {
    name: string;
    bundle: unknown;
    canonicalUtf8: string;
    canonicalHex: string;
    sha256Hex: string;
    delegatedRules: { zoneId: string; canonicalUtf8: string; canonicalHex: string }[];
    trustedKeys: TrustedKeyVector[];
    threshold: number;
    verified: boolean;
    delegateVerifiedZones: string[];
}

interface PlacementVector {
    name: string;
    rosterRef: string;
    policyRef: string | null;
    context: {
        phone: string;
        country?: string;
        mccmnc?: string;
        carrier?: string;
        regionHint?: string;
        affiliations?: string[];
        attributes?: Record<string, string>;
    };
    evaluatedAt: string;
    expectedHomeserverId: string;
    expectedRule: string;
    expectedRuleId: string;
    fallback?: {
        routingKeyUtf8: string;
        rosterVersion: number;
        candidates: { id: string; weight: number }[];
        stableHash: number;
    };
}

interface ResolveAnswerVector {
    name: string;
    rosterRef: string;
    answer: { serverName: string; baseUrl: string; masIssuer: string | null };
    expected: string;
}

interface ClientVectors {
    vectors: string;
    protocol: string;
    notes: string[];
    keys: Record<string, Omit<KeyVector, "name">>;
    instants: { iso: string; epochMs: string }[];
    rosters: RosterVector[];
    rosterRejections: RosterVector[];
    log: {
        leafData: string;
        hashing: string;
        events: LogEventVector[];
        roots: { size: number; rootHex: string }[];
        consistencyProofs: ConsistencyVector[];
        invalidConsistencyProofs: ConsistencyVector[];
    };
    policies: PolicyVector[];
    policyRejections: PolicyVector[];
    placements: PlacementVector[];
    resolveAnswers: ResolveAnswerVector[];
}

interface MemberEntryVector {
    name: string;
    homeserver: MemberHomeserver;
    member: unknown;
    notBeforeEpochMs?: number;
    notAfterEpochMs?: number;
    canonicalHex?: string;
    sha256Hex?: string;
    previous?: PriorMemberEntry;
    reason?: string;
}

interface LpVectors {
    encoding: string;
    decision: string;
    protocol: string;
    notes: string[];
    keys: Record<string, Omit<KeyVector, "name">>;
    primitives: { name: string; type: string; value: unknown; hex: string }[];
    memberEntries: MemberEntryVector[];
    rejections: MemberEntryVector[];
}

function fixture<T>(file: string): T {
    return JSON.parse(readFileSync(join(__dirname, "fixtures", file), "utf8"));
}

const vectors = fixture<ClientVectors>("gua-client-verification-v1-vectors.json");
const lp = fixture<LpVectors>("gua-lp-v1-vectors.json");
const crypto = new VerifierCrypto();

function namedKeys(keys: Record<string, Omit<KeyVector, "name">>): KeyVector[] {
    return Object.entries(keys).map(([name, key]) => ({ name, ...key }));
}

function trustedKeys(list: TrustedKeyVector[]): TrustedKey[] {
    return list.map((k) => ({ id: k.id, publicKey: k.publicKeySpkiB64 }));
}

function base64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

async function countVotes(
    roster: ReturnType<typeof parseSignedRoster>,
    bytes: Uint8Array,
    keys: TrustedKeyVector[],
): Promise<number> {
    const keySet = await TrustedKeySet.load(crypto, trustedKeys(keys));
    const votes = await keySet.countVotes(
        bytes,
        roster.authoritySignatures.map((s) => ({ keyId: s.authorityKeyId, signatureB64: s.signatureB64 })),
    );
    return votes.valid;
}

function rosterByRef(refs: Record<string, RosterVector>, ref: string): RosterVector {
    const vector = refs[ref];
    if (!vector) throw new Error(`unknown roster reference ${ref}`);
    return vector;
}

function placementContext(vector: PlacementVector): PlacementContext {
    return {
        phone: vector.context.phone,
        country: vector.context.country ?? null,
        mccmnc: vector.context.mccmnc ?? null,
        carrier: vector.context.carrier ?? null,
        regionHint: vector.context.regionHint ?? null,
        affiliations: vector.context.affiliations ?? [],
        attributes: vector.context.attributes ?? {},
    };
}

async function verifiedPolicy(vector: PolicyVector): Promise<VerifiedPolicy> {
    const bundle = parseRoutingPolicy(vector.bundle);
    const keySet = await TrustedKeySet.load(crypto, trustedKeys(vector.trustedKeys));
    const verifier = new PolicyVerifier(crypto, keySet, vector.threshold);
    expect(await verifier.isVerified(bundle)).toBe(true);
    return { bundle, delegateVerifiedZones: await verifier.delegateVerifiedZones(bundle) };
}

async function expectKeyVector(key: KeyVector): Promise<void> {
    const spki = decodeEd25519Spki(key.publicKeySpkiB64);
    expect(spki).not.toBeNull();
    expect(spki!.length).toBe(44);
    expect(bytesToHex(spki!.subarray(0, 12))).toBe(ED25519_SPKI_PREFIX_HEX);
    expect(bytesToHex(spki!.subarray(12))).toBe(key.publicKeyHex);
    const imported = await crypto.importPublicKey(key.publicKeySpkiB64);
    expect(imported).not.toBeNull();
    if (key.privateKeyPkcs8B64) {
        const privateKey = await webcrypto.subtle.importKey(
            "pkcs8",
            decodeEd25519Pkcs8(key.privateKeyPkcs8B64),
            { name: "Ed25519" },
            false,
            ["sign"],
        );
        const message = new Uint8Array([1]);
        const signature = new Uint8Array(await webcrypto.subtle.sign({ name: "Ed25519" }, privateKey, message));
        expect(await crypto.verify(imported!, message, base64(signature))).toBe(true);
        expect(await crypto.verify(imported!, new Uint8Array([2]), base64(signature))).toBe(false);
    }
}

function decodeEd25519Pkcs8(b64: string): Uint8Array {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

describe("gua-client-verification.v1 vectors", () => {
    it("covers every section of the file", () => {
        expect(vectors.vectors).toBe("gua-client-verification.v1");
        expect(Object.keys(vectors).sort()).toEqual(
            [
                "vectors",
                "protocol",
                "notes",
                "keys",
                "instants",
                "rosters",
                "rosterRejections",
                "log",
                "policies",
                "policyRejections",
                "placements",
                "resolveAnswers",
            ].sort(),
        );
        expect(Object.keys(vectors.log).sort()).toEqual(
            ["leafData", "hashing", "events", "roots", "consistencyProofs", "invalidConsistencyProofs"].sort(),
        );
    });

    describe("keys", () => {
        it.each(namedKeys(vectors.keys))("$name", async (key) => {
            await expectKeyVector(key);
        });
    });

    describe("instants", () => {
        it.each(vectors.instants)("$iso", (instant) => {
            expect(parseInstant(instant.iso)?.epochMs).toBe(Number(instant.epochMs));
        });
    });

    describe("rosters", () => {
        it.each(vectors.rosters)("$name", async (vector) => {
            const roster = parseSignedRoster(vector.roster);
            expect(detectRosterForm(roster)).toBe(vector.form);
            const form = vector.form as "v1" | "legacy";
            expect(canonicalRosterText(roster, form)).toBe(vector.canonicalUtf8);
            const bytes = canonicalRosterBytes(roster, form);
            expect(bytesToHex(bytes)).toBe(vector.canonicalHex);
            expect(await crypto.sha256Hex(bytes)).toBe(vector.sha256Hex);

            const valid = await countVotes(roster, bytes, vector.trustedKeys);
            expect(valid).toBe(vector.validSignatures);
            expect(valid >= vector.threshold).toBe(vector.verified);

            const memberVerifier = new MemberEntryVerifier(crypto);
            for (const entry of roster.entries) {
                if (entry.member === undefined) continue;
                const result = await memberVerifier.verify(
                    entry.homeserver,
                    entry.member,
                    instantToEpochMs(roster.issuedAt),
                );
                expect(result).toMatchObject({ outcome: "valid" });
            }
        });
    });

    describe("rosterRejections", () => {
        it.each(vectors.rosterRejections.filter((v) => v.clientOnly))("$name", (vector) => {
            expect(vector.form).toBe("mixed");
            expect(detectRosterForm(parseSignedRoster(vector.roster))).toBe("mixed");
        });

        it.each(vectors.rosterRejections.filter((v) => !v.clientOnly))("$name", async (vector) => {
            expect(vector.verified).toBe(false);
            const roster = parseSignedRoster(vector.roster);
            const bytes = canonicalRosterBytes(roster, vector.form as "v1" | "legacy");
            expect(bytesToHex(bytes)).toBe(vector.canonicalHex);
            expect(await crypto.sha256Hex(bytes)).toBe(vector.sha256Hex);
            const valid = await countVotes(roster, bytes, vector.trustedKeys);
            expect(valid).toBe(vector.validSignatures);
            expect(valid).toBeLessThan(vector.threshold);
        });
    });

    describe("log", () => {
        const merkle = new MerkleTree(crypto);
        const leaves: string[] = [];

        beforeAll(async () => {
            for (const event of vectors.log.events) {
                leaves.push(await merkle.leafHash(MerkleTree.leafData(toLogEvent(event))));
            }
        });

        it.each(vectors.log.events)("leaf $index $type", async (event) => {
            const data = MerkleTree.leafData(toLogEvent(event));
            expect(data).toBe(event.leafDataUtf8);
            expect(await merkle.leafHash(data)).toBe(event.leafHashHex);
        });

        it.each(vectors.log.roots)("root at size $size", async (root) => {
            expect(await merkle.root(leaves.slice(0, root.size))).toBe(root.rootHex);
        });

        it.each(vectors.log.consistencyProofs)("consistency $first to $second", async (proof) => {
            expect(proof.valid).toBe(true);
            expect(
                await merkle.verifyConsistency(
                    proof.first,
                    proof.second,
                    proof.oldRootHex,
                    proof.newRootHex,
                    proof.proof,
                ),
            ).toBe(true);
        });

        it.each(vectors.log.invalidConsistencyProofs)("$name", async (proof) => {
            expect(proof.valid).toBe(false);
            expect(
                await merkle.verifyConsistency(
                    proof.first,
                    proof.second,
                    proof.oldRootHex,
                    proof.newRootHex,
                    proof.proof,
                ),
            ).toBe(false);
        });
    });

    describe("policies and policyRejections", () => {
        it.each([...vectors.policies, ...vectors.policyRejections])("$name", async (vector) => {
            const bundle = parseRoutingPolicy(vector.bundle);
            expect(canonicalPolicyText(bundle)).toBe(vector.canonicalUtf8);
            const bytes = canonicalPolicyBytes(bundle);
            expect(bytesToHex(bytes)).toBe(vector.canonicalHex);
            expect(await crypto.sha256Hex(bytes)).toBe(vector.sha256Hex);
            for (const zone of vector.delegatedRules) {
                const delegated = canonicalDelegatedRulesBytes(
                    bundle.policyId,
                    bundle.version,
                    zone.zoneId,
                    bundle.rules,
                );
                expect(bytesToHex(delegated)).toBe(zone.canonicalHex);
            }
            const keySet = await TrustedKeySet.load(crypto, trustedKeys(vector.trustedKeys));
            const verifier = new PolicyVerifier(crypto, keySet, vector.threshold);
            expect(await verifier.isVerified(bundle)).toBe(vector.verified);
            expect([...(await verifier.delegateVerifiedZones(bundle))].sort()).toEqual(
                [...vector.delegateVerifiedZones].sort(),
            );
        });

        it.each(vectors.policyRejections)("$name is refused", (vector) => {
            expect(vector.verified).toBe(false);
        });
    });

    describe("placements", () => {
        const rosters: Record<string, RosterVector> = { r1: vectors.rosters[0], r2: vectors.rosters[1] };
        const policies: Record<string, PolicyVector> = {
            "br-policy v3": vectors.policies[0],
            "br-policy v3 without the sp-zone delegate signature": vectors.policies[1],
        };

        it.each(vectors.placements)("$name", async (vector) => {
            const rosterVector = rosterByRef(rosters, vector.rosterRef);
            const roster = parseSignedRoster(rosterVector.roster);
            const bytes = canonicalRosterBytes(roster, rosterVector.form as "v1" | "legacy");
            expect(await countVotes(roster, bytes, rosterVector.trustedKeys)).toBeGreaterThanOrEqual(
                rosterVector.threshold,
            );

            let policy: VerifiedPolicy | null = null;
            if (vector.policyRef !== null) {
                const policyVector = policies[vector.policyRef];
                if (!policyVector) throw new Error(`unknown policy reference ${vector.policyRef}`);
                policy = await verifiedPolicy(policyVector);
            }

            const decision = await reproducePlacement(
                crypto,
                placementContext(vector),
                roster,
                policy,
                instantToEpochMs(vector.evaluatedAt),
            );
            expect(decision).toEqual({
                homeserverId: vector.expectedHomeserverId,
                rule: vector.expectedRule,
                ruleId: vector.expectedRuleId,
            });
        });

        it.each(vectors.placements.filter((v) => v.fallback))("$name: weighted fallback inputs", async (vector) => {
            const roster = parseSignedRoster(rosterByRef(rosters, vector.rosterRef).roster);
            const context = placementContext(vector);
            const fallback = vector.fallback!;
            expect(routingKey(context)).toBe(fallback.routingKeyUtf8);
            expect(roster.version).toBe(fallback.rosterVersion);
            const candidates = placementCandidates(roster);
            expect(candidates.map((c) => ({ id: c.id, weight: c.weight }))).toEqual(fallback.candidates);
            expect(await stableHash(crypto, context, roster.version, candidates)).toBe(fallback.stableHash);
        });
    });

    describe("resolveAnswers", () => {
        const rosters: Record<string, RosterVector> = {
            "r2": vectors.rosters[1],
            "prod-2026-10-27": vectors.rosters[3],
        };

        it.each(vectors.resolveAnswers)("$name", (vector) => {
            const roster = parseSignedRoster(rosterByRef(rosters, vector.rosterRef).roster);
            const answer = vector.answer;
            expect(locateHomeserver(answer.serverName, answer.baseUrl, answer.masIssuer ?? null, roster).match).toBe(
                vector.expected,
            );
        });
    });
});

describe("gua-lp.v1 vectors", () => {
    it("covers every section of the file", () => {
        expect(lp.encoding).toBe("gua-lp.v1");
        expect(Object.keys(lp).sort()).toEqual(
            ["encoding", "decision", "protocol", "notes", "keys", "primitives", "memberEntries", "rejections"].sort(),
        );
    });

    describe("keys", () => {
        it.each(namedKeys(lp.keys))("$name", async (key) => {
            await expectKeyVector(key);
        });
    });

    describe("primitives", () => {
        it.each(lp.primitives)("$name", (primitive) => {
            const encoder = LengthPrefixedEncoder.raw();
            switch (primitive.type) {
                case "string":
                    encoder.string(primitive.value as string);
                    break;
                case "int64":
                    encoder.int64(BigInt(primitive.value as string));
                    break;
                case "bool":
                    encoder.bool(primitive.value as boolean);
                    break;
                case "optionalString":
                    encoder.optionalString(primitive.value as string | null);
                    break;
                case "stringSet":
                    encoder.stringSet(primitive.value as string[]);
                    break;
                case "stringList":
                    encoder.stringList(primitive.value as string[]);
                    break;
                case "enum":
                    encoder.enumName(primitive.value as string);
                    break;
                default:
                    throw new Error(`unknown primitive type ${primitive.type}`);
            }
            expect(bytesToHex(encoder.toBytes())).toBe(primitive.hex);
        });
    });

    describe("memberEntries", () => {
        it.each(lp.memberEntries)("$name", async (vector) => {
            const member = parseMemberBlock(vector.member);
            expect(parseInstant(member.notBefore!)?.epochMs).toBe(vector.notBeforeEpochMs);
            expect(parseInstant(member.notAfter!)?.epochMs).toBe(vector.notAfterEpochMs);
            const bytes = memberEntryBytes(vector.homeserver, member);
            expect(bytesToHex(bytes)).toBe(vector.canonicalHex);
            expect(await crypto.sha256Hex(bytes)).toBe(vector.sha256Hex);

            const result = await new MemberEntryVerifier(crypto).verify(
                vector.homeserver,
                vector.member,
                vector.notBeforeEpochMs!,
                vector.previous ?? null,
            );
            expect(result).toEqual({ outcome: "valid", entryHash: vector.sha256Hex });
        });
    });

    describe("rejections", () => {
        it.each(lp.rejections)("$name", async (vector) => {
            const at = instantToEpochMs("2026-10-27T00:00:00Z");
            const result = await new MemberEntryVerifier(crypto).verify(
                vector.homeserver,
                vector.member,
                at,
                vector.previous ?? null,
            );
            expect(result.outcome).toBe("invalid");
        });
    });
});

function toLogEvent(event: LogEventVector): {
    index: number;
    type: string;
    homeserverId: string | null;
    payloadHash: string;
    recordedAtEpochMs: number;
} {
    return {
        index: event.index,
        type: event.type,
        homeserverId: event.homeserverId,
        payloadHash: event.payloadHash,
        recordedAtEpochMs: instantToEpochMs(event.recordedAt),
    };
}
