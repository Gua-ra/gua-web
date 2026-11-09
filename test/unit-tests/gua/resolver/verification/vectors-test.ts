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
    checkRosterSignature,
    detectRosterForm,
    locateHomeserver,
    parseSignedRoster,
    type SignedRoster,
} from "../../../../../src/gua/resolver/verification/canonical";
import {
    bytesToHex,
    concatBytes,
    decodeEd25519Spki,
    ED25519_SPKI_PREFIX_HEX,
    type TrustedKey,
    TrustedKeySet,
    VerifierCrypto,
} from "../../../../../src/gua/resolver/verification/ed25519";
import { instantToEpochMs, parseInstant } from "../../../../../src/gua/resolver/verification/json";
import { LengthPrefixedEncoder } from "../../../../../src/gua/resolver/verification/lengthPrefixed";
import {
    memberEntryBytes,
    type MemberHomeserver,
    parseMemberBlock,
    verifyMemberEntry,
} from "../../../../../src/gua/resolver/verification/memberEntry";
import { MerkleTree, parseLogEvents } from "../../../../../src/gua/resolver/verification/merkle";
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
    delegateVerifiedZones,
    inEffect,
    parseRoutingPolicy,
    policyLogOutcome,
    policySignatureFailure,
    type PublishedPolicy,
    type RoutingPolicyBundle,
} from "../../../../../src/gua/resolver/verification/policy";
import { formatOutcome } from "../../../../../src/gua/resolver/verification/report";

// jsdom has no SubtleCrypto.
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
    ref?: string;
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
    expectedOutcome?: string;
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
    ref?: string;
    bundle: unknown;
    canonicalUtf8: string;
    canonicalHex: string;
    sha256Hex: string;
    delegatedRules: { zoneId: string; canonicalUtf8: string; canonicalHex: string }[];
    trustedKeys: TrustedKeyVector[];
    threshold: number;
    verified: boolean;
    delegateVerifiedZones: string[];
    expectedOutcome?: string;
}

interface PolicyLogVector {
    name: string;
    servedPolicy: PublishedPolicy | null;
    checkpoint: { size: number; rootHex: string };
    expected: string;
}

interface WindowVector {
    name: string;
    notBefore: string | null;
    expiresAt: string | null;
    evaluatedAt: string;
    inEffect: boolean;
}

interface PolicyValidityVector {
    name: string;
    policyRef: string;
    evaluatedAt: string;
    inEffect: boolean;
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
    unsignedRuleAbove: boolean;
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
    expectedEntryId: string | null;
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
    policyValidity: PolicyValidityVector[];
    windows: WindowVector[];
    policyLog: PolicyLogVector[];
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
    previous?: unknown;
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

function byRef<T extends { ref?: string }>(list: T[], ref: string): T {
    const vector = list.find((v) => v.ref === ref);
    if (!vector) throw new Error(`unknown reference ${ref}`);
    return vector;
}

function base64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

async function countVotes(roster: SignedRoster, bytes: Uint8Array, keys: TrustedKeyVector[]): Promise<number> {
    const keySet = await TrustedKeySet.load(crypto, trustedKeys(keys));
    return (await keySet.countVotes(bytes, roster.authoritySignatures)).valid;
}

/** Checked with the form the vector names, which for one rejection is not the form its JSON implies. */
async function rosterSignatureOutcome(vector: RosterVector): Promise<string> {
    const keySet = await TrustedKeySet.load(crypto, trustedKeys(vector.trustedKeys ?? []));
    const roster = parseSignedRoster(vector.roster);
    return formatOutcome(await checkRosterSignature(roster, vector.form, keySet, vector.threshold));
}

async function policySignatureOutcome(bundle: RoutingPolicyBundle, vector: PolicyVector): Promise<string> {
    const keySet = await TrustedKeySet.load(crypto, trustedKeys(vector.trustedKeys));
    const failure = await policySignatureFailure(keySet, bundle, canonicalPolicyBytes(bundle), vector.threshold);
    return failure ? formatOutcome(failure) : "valid";
}

/** Drops the stated affiliations and attributes, as the server does without verified claims. */
function placementContext(vector: PlacementVector): PlacementContext {
    return {
        phone: vector.context.phone,
        country: vector.context.country ?? null,
        mccmnc: vector.context.mccmnc ?? null,
        carrier: vector.context.carrier ?? null,
        regionHint: vector.context.regionHint ?? null,
    };
}

async function verifiedPolicy(vector: PolicyVector): Promise<VerifiedPolicy> {
    const bundle = parseRoutingPolicy(vector.bundle);
    expect(await policySignatureOutcome(bundle, vector)).toBe("valid");
    return { bundle, delegateVerifiedZones: await delegateVerifiedZones(crypto, bundle) };
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
            Uint8Array.from(atob(key.privateKeyPkcs8B64), (c) => c.charCodeAt(0)),
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

// No signed object the app checks uses these gua-lp.v1 primitives; they are encoded here only to pin the vectors.
function encodeBool(value: boolean): Uint8Array {
    return new Uint8Array([value ? 1 : 0]);
}

function encodeStringList(values: string[]): Uint8Array {
    const count = new Uint8Array(4);
    new DataView(count.buffer).setUint32(0, values.length, false);
    return concatBytes(count, ...values.map((v) => new LengthPrefixedEncoder().string(v).toBytes()));
}

function encodePrimitive(type: string, value: unknown): Uint8Array {
    const encoder = new LengthPrefixedEncoder();
    switch (type) {
        case "string":
            return encoder.string(value as string).toBytes();
        case "int64":
            return encoder.int64(BigInt(value as string)).toBytes();
        case "optionalString":
            return encoder.optionalString(value as string | null).toBytes();
        case "stringSet":
            return encoder.stringSet(value as string[]).toBytes();
        case "enum":
            return encoder.enumName(value as string).toBytes();
        case "bool":
            return encodeBool(value as boolean);
        case "stringList":
            return encodeStringList(value as string[]);
        default:
            throw new Error(`unknown primitive type ${type}`);
    }
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
                "policyValidity",
                "windows",
                "policyLog",
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
            expect(await rosterSignatureOutcome(vector)).toBe("valid");

            for (const entry of roster.entries) {
                if (entry.member === undefined) continue;
                const at = instantToEpochMs(roster.issuedAt);
                expect(await verifyMemberEntry(crypto, entry.homeserver, entry.member, at)).toEqual({
                    outcome: "valid",
                });
            }
        });
    });

    it("encodes a null id, serverName and baseUrl as the text null, as it does a null masIssuer", () => {
        const roster = JSON.parse(JSON.stringify(byRef(vectors.rosters, "r7").roster));
        Object.assign(roster.entries[0].homeserver, { id: null, serverName: null, baseUrl: null });
        const entryLine = canonicalRosterText(parseSignedRoster(roster), "v1").split("\n")[4];

        expect(entryLine.startsWith("null\u001fnull\u001fnull\u001fnull\u001f")).toBe(true);
    });

    describe("rosterRejections", () => {
        it.each(vectors.rosterRejections)("$name: $expectedOutcome", async (vector) => {
            expect(await rosterSignatureOutcome(vector)).toBe(vector.expectedOutcome);
        });

        it.each(vectors.rosterRejections.filter((v) => v.clientOnly))("$name: detected as mixed", (vector) => {
            expect(detectRosterForm(parseSignedRoster(vector.roster))).toBe("mixed");
        });

        it.each(vectors.rosterRejections.filter((v) => !v.clientOnly))("$name: bytes and votes", async (vector) => {
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
            expect(await policySignatureOutcome(bundle, vector)).toBe(vector.expectedOutcome ?? "valid");
            expect([...(await delegateVerifiedZones(crypto, bundle))].sort()).toEqual(
                [...vector.delegateVerifiedZones].sort(),
            );
        });

        it.each(vectors.policyRejections)("$name is refused", (vector) => {
            expect(vector.verified).toBe(false);
        });
    });

    describe("windows", () => {
        it.each(vectors.windows)("$name", (vector) => {
            const at = instantToEpochMs(vector.evaluatedAt);
            expect(inEffect(vector.notBefore, vector.expiresAt, at)).toBe(vector.inEffect);
        });
    });

    describe("policyLog", () => {
        it.each(vectors.policyLog)("$name: $expected", async (vector) => {
            const events = parseLogEvents({ events: vectors.log.events });
            const checkpoint = { merkleRoot: vector.checkpoint.rootHex, size: vector.checkpoint.size };
            const outcome = await policyLogOutcome(crypto, vector.servedPolicy, checkpoint, events);
            expect(formatOutcome(outcome)).toBe(vector.expected);
        });
    });

    describe("policyValidity", () => {
        it.each(vectors.policyValidity)("$name", (vector) => {
            const bundle = parseRoutingPolicy(byRef(vectors.policies, vector.policyRef).bundle);
            const at = instantToEpochMs(vector.evaluatedAt);
            expect(inEffect(bundle.notBefore, bundle.expiresAt, at)).toBe(vector.inEffect);
        });
    });

    describe("placements", () => {
        it.each(vectors.placements)("$name", async (vector) => {
            const rosterVector = byRef(vectors.rosters, vector.rosterRef);
            const roster = parseSignedRoster(rosterVector.roster);
            const bytes = canonicalRosterBytes(roster, rosterVector.form as "v1" | "legacy");
            expect(await countVotes(roster, bytes, rosterVector.trustedKeys)).toBeGreaterThanOrEqual(
                rosterVector.threshold,
            );
            const policy =
                vector.policyRef === null ? null : await verifiedPolicy(byRef(vectors.policies, vector.policyRef));

            const { decision, unsignedRuleAbove } = await reproducePlacement(
                crypto,
                placementContext(vector),
                roster,
                policy,
                instantToEpochMs(vector.evaluatedAt),
            );
            expect({ homeserverId: decision?.homeserver.id, rule: decision?.rule, ruleId: decision?.ruleId }).toEqual({
                homeserverId: vector.expectedHomeserverId,
                rule: vector.expectedRule,
                ruleId: vector.expectedRuleId,
            });
            expect(unsignedRuleAbove).toBe(vector.unsignedRuleAbove);
        });

        it.each(vectors.placements.filter((v) => v.fallback))("$name: weighted fallback inputs", async (vector) => {
            const roster = parseSignedRoster(byRef(vectors.rosters, vector.rosterRef).roster);
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
        it.each(vectors.resolveAnswers)("$name", (vector) => {
            const roster = parseSignedRoster(byRef(vectors.rosters, vector.rosterRef).roster);
            const { serverName, baseUrl, masIssuer } = vector.answer;
            const located = locateHomeserver({ serverName, baseUrl, masIssuer: masIssuer ?? null }, roster);
            expect(located.match).toBe(vector.expected);
            expect(located.entry?.homeserver.id ?? null).toBe(vector.expectedEntryId);
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
            expect(bytesToHex(encodePrimitive(primitive.type, primitive.value))).toBe(primitive.hex);
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

            const at = vector.notBeforeEpochMs!;
            expect(await verifyMemberEntry(crypto, vector.homeserver, vector.member, at)).toEqual({ outcome: "valid" });
        });
    });

    describe("rejections", () => {
        // A rejection that needs a previously accepted entry tests key continuity, which v1 does not check.
        it.each(lp.rejections.filter((v) => v.previous === undefined))("$name", async (vector) => {
            const at = instantToEpochMs("2026-10-27T00:00:00Z");
            const result = await verifyMemberEntry(crypto, vector.homeserver, vector.member, at);
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
