/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { parseInstant, type RosterHomeserver } from "./canonical";
import { type VerifierCrypto } from "./ed25519";
import { CanonicalEncodingError, LengthPrefixedEncoder } from "./lengthPrefixed";
import { type Reason } from "./report";

export const MEMBER_ENTRY_SCHEMA = "gua-member-entry.v1";
export const MEMBER_ENTRY_ALG = "Ed25519";
export const MEMBER_MAX_LIFETIME_MS = 400 * 86_400_000;

const MEMBER_KEYS = new Set(["schema", "alg", "keyId", "sequence", "notBefore", "notAfter", "signatures"]);
const SIGNATURE_KEYS = new Set(["keyId", "signatureB64"]);

export class MalformedMemberEntryError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "MalformedMemberEntryError";
    }
}

export interface MemberSignature {
    keyId: string | null;
    signatureB64: string | null;
}

export interface MemberBlock {
    schema: string | null;
    alg: string | null;
    keyId: string | null;
    sequence: number;
    notBefore: string | null;
    notAfter: string | null;
    signatures: MemberSignature[];
}

/** The fields the member signs; the rest of a roster entry is the authority's. */
export type MemberHomeserver = Pick<
    RosterHomeserver,
    "id" | "serverName" | "baseUrl" | "masIssuer" | "signingKey" | "region" | "searchVisibility" | "searchGroups"
>;

/** The last entry a verifier accepted for a homeserver id. */
export interface PriorMemberEntry {
    keyId: string | null;
    signingKey: string;
    sequence: number;
    entryHash: string | null;
}

export interface MemberCheckResult {
    outcome: "valid" | "unattested" | "invalid";
    reason?: Reason;
    entryHash?: string;
}

function nullableString(value: unknown, what: string): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") throw new MalformedMemberEntryError(`${what} is not a string`);
    return value;
}

/** Strict: unknown fields, nulls for primitives and fractional integers refuse the block. */
export function parseMemberBlock(value: unknown): MemberBlock {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new MalformedMemberEntryError("member is not an object");
    }
    const m = value as Record<string, unknown>;
    for (const key of Object.keys(m)) {
        if (!MEMBER_KEYS.has(key)) throw new MalformedMemberEntryError(`unknown field ${key}`);
    }
    let sequence = 0;
    if (m.sequence !== undefined) {
        if (typeof m.sequence !== "number" || !Number.isInteger(m.sequence)) {
            throw new MalformedMemberEntryError("sequence is not an integer");
        }
        sequence = m.sequence;
    }
    const signatures: MemberSignature[] = [];
    if (m.signatures !== undefined && m.signatures !== null) {
        if (!Array.isArray(m.signatures)) throw new MalformedMemberEntryError("signatures is not a list");
        for (const s of m.signatures) {
            if (typeof s !== "object" || s === null || Array.isArray(s)) {
                throw new MalformedMemberEntryError("signature is not an object");
            }
            const sig = s as Record<string, unknown>;
            for (const key of Object.keys(sig)) {
                if (!SIGNATURE_KEYS.has(key)) throw new MalformedMemberEntryError(`unknown field ${key}`);
            }
            signatures.push({
                keyId: nullableString(sig.keyId, "signature.keyId"),
                signatureB64: nullableString(sig.signatureB64, "signature.signatureB64"),
            });
        }
    }
    return {
        schema: nullableString(m.schema, "schema"),
        alg: nullableString(m.alg, "alg"),
        keyId: nullableString(m.keyId, "keyId"),
        sequence,
        notBefore: nullableString(m.notBefore, "notBefore"),
        notAfter: nullableString(m.notAfter, "notAfter"),
        signatures,
    };
}

function epochMs(iso: string | null, what: string): number {
    const parsed = iso === null ? null : parseInstant(iso);
    if (!parsed) throw new CanonicalEncodingError(`${what} is required`);
    return parsed.epochMs;
}

/** CanonicalMemberEntry: the gua-member-entry.v1 bytes, signatures excluded. */
export function memberEntryBytes(homeserver: MemberHomeserver, member: MemberBlock): Uint8Array {
    return LengthPrefixedEncoder.begin(MEMBER_ENTRY_SCHEMA)
        .string(homeserver.id)
        .string(homeserver.serverName)
        .string(homeserver.baseUrl)
        .string(homeserver.masIssuer)
        .string(member.alg)
        .string(homeserver.signingKey)
        .string(member.keyId)
        .int64(member.sequence)
        .int64(epochMs(member.notBefore, "notBefore"))
        .int64(epochMs(member.notAfter, "notAfter"))
        .optionalString(homeserver.region)
        .enumName(homeserver.searchVisibility ?? "GLOBAL")
        .stringSet(homeserver.searchGroups ?? [])
        .toBytes();
}

/** MemberEntryVerifier: a member's self-signature over its own roster entry, checked at `at`. */
export class MemberEntryVerifier {
    public constructor(
        private readonly crypto: VerifierCrypto,
        private readonly maxLifetimeMs = MEMBER_MAX_LIFETIME_MS,
    ) {}

    public async verify(
        homeserver: MemberHomeserver,
        rawMember: unknown,
        atEpochMs: number,
        prior: PriorMemberEntry | null = null,
    ): Promise<MemberCheckResult> {
        if (rawMember === undefined || rawMember === null) return { outcome: "unattested" };
        let member: MemberBlock;
        try {
            member = parseMemberBlock(rawMember);
        } catch {
            return invalid("parse_error");
        }
        if (member.schema !== MEMBER_ENTRY_SCHEMA) return invalid("unsupported_schema");
        if (member.alg !== MEMBER_ENTRY_ALG) return invalid("unsupported_alg");
        if (!member.keyId || member.keyId.trim() === "") return invalid("bad_key_id");
        if (member.sequence < 1) return invalid("bad_sequence");
        if (!this.windowHolds(member, atEpochMs)) return invalid("bad_window");
        if (!signatureShapeHolds(member)) return invalid("malformed_signature");

        let canonical: Uint8Array;
        try {
            canonical = memberEntryBytes(homeserver, member);
        } catch {
            return invalid("no_canonical_encoding");
        }
        const hash = await this.crypto.sha256Hex(canonical);

        const key = homeserver.signingKey ? await this.crypto.importPublicKey(homeserver.signingKey) : null;
        if (!key) return invalid("bad_signing_key", hash);
        const own = member.signatures.find((s) => s.keyId === member.keyId);
        if (!own) return invalid("no_own_signature", hash);
        if (!(await this.crypto.verify(key, canonical, own.signatureB64!))) return invalid("bad_signature", hash);

        if (prior) {
            const continuity = await this.continuity(homeserver, member, prior, canonical, hash);
            if (continuity) return invalid(continuity, hash);
        }
        return { outcome: "valid", entryHash: hash };
    }

    private windowHolds(member: MemberBlock, atEpochMs: number): boolean {
        const notBefore = member.notBefore === null ? null : parseInstant(member.notBefore);
        const notAfter = member.notAfter === null ? null : parseInstant(member.notAfter);
        if (!notBefore || !notAfter || !notBefore.exactMillis || !notAfter.exactMillis) return false;
        if (notAfter.epochMs <= notBefore.epochMs) return false;
        if (notAfter.epochMs - notBefore.epochMs > this.maxLifetimeMs) return false;
        return atEpochMs >= notBefore.epochMs && atEpochMs <= notAfter.epochMs;
    }

    private async continuity(
        homeserver: MemberHomeserver,
        member: MemberBlock,
        prior: PriorMemberEntry,
        canonical: Uint8Array,
        hash: string,
    ): Promise<Reason | null> {
        const keyChanged = homeserver.signingKey !== prior.signingKey;
        if (member.sequence < prior.sequence) return "bad_sequence";
        if (member.sequence === prior.sequence) {
            if (keyChanged) return "bad_sequence";
            return prior.entryHash !== null && prior.entryHash !== hash ? "bad_sequence" : null;
        }
        if (!keyChanged) return null;
        if (prior.keyId !== null && prior.keyId === member.keyId) return "bad_key_id";
        const previous = await this.crypto.importPublicKey(prior.signingKey);
        if (!previous) return "rotation_not_signed";
        for (const s of member.signatures) {
            const byPrevious = prior.keyId !== null ? s.keyId === prior.keyId : s.keyId !== member.keyId;
            if (byPrevious && (await this.crypto.verify(previous, canonical, s.signatureB64!))) return null;
        }
        return "rotation_not_signed";
    }
}

function signatureShapeHolds(member: MemberBlock): boolean {
    if (member.signatures.length === 0) return false;
    const seen = new Set<string>();
    for (const s of member.signatures) {
        if (!s.keyId || s.keyId.trim() === "" || s.signatureB64 === null) return false;
        if (seen.has(s.keyId)) return false;
        seen.add(s.keyId);
    }
    return true;
}

function invalid(reason: Reason, entryHash?: string): MemberCheckResult {
    return entryHash === undefined ? { outcome: "invalid", reason } : { outcome: "invalid", reason, entryHash };
}
