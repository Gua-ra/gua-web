/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type RosterHomeserver } from "./canonical";
import { type VerifierCrypto } from "./ed25519";
import { absentOrString, int64, list, object, ParseError, parseInstant } from "./json";
import { CanonicalEncodingError, LengthPrefixedEncoder } from "./lengthPrefixed";
import { type CheckResult, invalid, Reason } from "./report";

export const MEMBER_ENTRY_SCHEMA = "gua-member-entry.v1";
const MEMBER_ENTRY_ALG = "Ed25519";
const MAX_LIFETIME_MS = 400 * 86_400_000;

const MEMBER_KEYS = new Set(["schema", "alg", "keyId", "sequence", "notBefore", "notAfter", "signatures"]);
const SIGNATURE_KEYS = new Set(["keyId", "signatureB64"]);

interface MemberSignature {
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

function strictObject(value: unknown, allowed: Set<string>): Record<string, unknown> {
    const o = object(value);
    for (const key of Object.keys(o)) {
        if (!allowed.has(key)) throw new ParseError("unknown field");
    }
    return o;
}

function parseSignature(value: unknown): MemberSignature {
    const s = strictObject(value, SIGNATURE_KEYS);
    return { keyId: absentOrString(s.keyId), signatureB64: absentOrString(s.signatureB64) };
}

export function parseMemberBlock(value: unknown): MemberBlock {
    const m = strictObject(value, MEMBER_KEYS);
    return {
        schema: absentOrString(m.schema),
        alg: absentOrString(m.alg),
        keyId: absentOrString(m.keyId),
        sequence: m.sequence === undefined ? 0 : int64(m.sequence),
        notBefore: absentOrString(m.notBefore),
        notAfter: absentOrString(m.notAfter),
        signatures: m.signatures === undefined ? [] : list(m.signatures).map(parseSignature),
    };
}

function epochMs(iso: string | null): number {
    const parsed = iso === null ? null : parseInstant(iso);
    if (!parsed) throw new CanonicalEncodingError("instant is required");
    return parsed.epochMs;
}

export function memberEntryBytes(homeserver: MemberHomeserver, member: MemberBlock): Uint8Array {
    return new LengthPrefixedEncoder()
        .string(MEMBER_ENTRY_SCHEMA)
        .string(homeserver.id)
        .string(homeserver.serverName)
        .string(homeserver.baseUrl)
        .string(homeserver.masIssuer)
        .string(member.alg)
        .string(homeserver.signingKey)
        .string(member.keyId)
        .int64(member.sequence)
        .int64(epochMs(member.notBefore))
        .int64(epochMs(member.notAfter))
        .optionalString(homeserver.region)
        .enumName(homeserver.searchVisibility ?? "GLOBAL")
        .stringSet(homeserver.searchGroups ?? [])
        .toBytes();
}

function blank(value: string | null): boolean {
    return value === null || value.trim() === "";
}

function windowFailure(member: MemberBlock, atEpochMs: number): Reason | null {
    const notBefore = member.notBefore === null ? null : parseInstant(member.notBefore);
    const notAfter = member.notAfter === null ? null : parseInstant(member.notAfter);
    if ((member.notBefore !== null && !notBefore) || (member.notAfter !== null && !notAfter)) return Reason.ParseError;
    if (!notBefore?.exactMillis || !notAfter?.exactMillis) return Reason.BadWindow;
    const lifetime = notAfter.epochMs - notBefore.epochMs;
    if (lifetime <= 0 || lifetime > MAX_LIFETIME_MS) return Reason.BadWindow;
    return atEpochMs < notBefore.epochMs || atEpochMs > notAfter.epochMs ? Reason.OutsideWindow : null;
}

function signaturesWellFormed(signatures: MemberSignature[]): boolean {
    const seen = new Set<string>();
    for (const s of signatures) {
        if (blank(s.keyId) || s.signatureB64 === null || seen.has(s.keyId!)) return false;
        seen.add(s.keyId!);
    }
    return signatures.length > 0;
}

export async function verifyMemberEntry(
    crypto: VerifierCrypto,
    homeserver: MemberHomeserver,
    rawMember: unknown,
    atEpochMs: number,
): Promise<CheckResult> {
    if (rawMember === undefined || rawMember === null) return { outcome: "unattested" };
    let member: MemberBlock;
    try {
        member = parseMemberBlock(rawMember);
    } catch {
        return invalid(Reason.ParseError);
    }
    if (member.schema !== MEMBER_ENTRY_SCHEMA) return invalid(Reason.UnsupportedSchema);
    if (member.alg !== MEMBER_ENTRY_ALG) return invalid(Reason.UnsupportedAlg);
    if (blank(member.keyId)) return invalid(Reason.BadKeyId);
    if (member.sequence < 1) return invalid(Reason.BadSequence);
    const badWindow = windowFailure(member, atEpochMs);
    if (badWindow) return invalid(badWindow);
    if (!signaturesWellFormed(member.signatures)) return invalid(Reason.MalformedSignature);

    let canonical: Uint8Array;
    try {
        canonical = memberEntryBytes(homeserver, member);
    } catch {
        return invalid(Reason.NoCanonicalEncoding);
    }
    const key = homeserver.signingKey ? await crypto.importPublicKey(homeserver.signingKey) : null;
    if (!key) return invalid(Reason.BadSigningKey);
    const own = member.signatures.find((s) => s.keyId === member.keyId);
    if (!own) return invalid(Reason.MissingSignature);
    return (await crypto.verify(key, canonical, own.signatureB64!))
        ? { outcome: "valid" }
        : invalid(Reason.BadSignature);
}
