/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type Signature, signatureFailure, type TrustedKeySet, utf8Bytes } from "./ed25519";
import {
    boolean,
    instantToEpochMs,
    int32,
    int64,
    list,
    object,
    optionalString,
    optionalStringList,
    ParseError,
    string,
    uint31,
} from "./json";
import { type CheckResult, invalid, Reason, type RosterForm, unverifiable } from "./report";

const FIELD_SEPARATOR = "\u001f";

/** Java String.compareTo: UTF-16 code unit order, which is also what JavaScript's < gives. */
export function compareUtf16(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

export function nz(value: string | null | undefined): string {
    return value ?? "";
}

export interface RosterHomeserver {
    id: string | null;
    serverName: string | null;
    baseUrl: string | null;
    masIssuer: string | null;
    region: string | null;
    weight: number;
    acceptsNew: boolean;
    signingKey: string | null;
    searchVisibility: string | null;
    searchGroups: string[] | null;
    /** Whether the served JSON carried the searchVisibility key at all; decides the roster form. */
    hasSearchVisibility: boolean;
}

export interface RosterClaim {
    country: string | null;
    mccmnc: string | null;
    carrier: string | null;
    phonePrefixes: string[] | null;
    affiliation: string | null;
    attributeMatch: Record<string, string> | null;
    remoteClaimUrl: string | null;
    priority: number;
}

export interface RosterEntry {
    homeserver: RosterHomeserver;
    claims: RosterClaim[];
    admittedAt: string | null;
    status: string;
    /** The member block exactly as served, parsed strictly by the member-entry check. */
    member: unknown;
}

export interface LogCheckpoint {
    merkleRoot: string;
    size: number;
}

export interface SignedRoster {
    version: number;
    issuedAt: string;
    entries: RosterEntry[];
    logCheckpoint: LogCheckpoint;
    authoritySignatures: Signature[];
}

function parseHomeserver(value: unknown): RosterHomeserver {
    const h = object(value);
    return {
        id: optionalString(h.id),
        serverName: optionalString(h.serverName),
        baseUrl: optionalString(h.baseUrl),
        masIssuer: optionalString(h.masIssuer),
        region: optionalString(h.region),
        weight: int32(h.weight),
        acceptsNew: boolean(h.acceptsNew),
        signingKey: optionalString(h.signingKey),
        searchVisibility: optionalString(h.searchVisibility),
        searchGroups: optionalStringList(h.searchGroups),
        hasSearchVisibility: Object.prototype.hasOwnProperty.call(h, "searchVisibility"),
    };
}

function parseClaim(value: unknown): RosterClaim {
    const c = object(value);
    const attributes = c.attributeMatch === undefined || c.attributeMatch === null ? null : object(c.attributeMatch);
    return {
        country: optionalString(c.country),
        mccmnc: optionalString(c.mccmnc),
        carrier: optionalString(c.carrier),
        phonePrefixes: optionalStringList(c.phonePrefixes),
        affiliation: optionalString(c.affiliation),
        attributeMatch: attributes && Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, string(v)])),
        remoteClaimUrl: optionalString(c.remoteClaimUrl),
        priority: int32(c.priority ?? 0),
    };
}

function parseEntry(value: unknown): RosterEntry {
    const e = object(value);
    return {
        homeserver: parseHomeserver(e.homeserver),
        claims: list(e.claims ?? []).map(parseClaim),
        admittedAt: optionalString(e.admittedAt),
        status: string(e.status),
        member: e.member ?? undefined,
    };
}

/** An entry without a key id or a value is kept as a signature that does not verify. */
function parseSignature(value: unknown): Signature {
    const s = object(value);
    return { keyId: optionalString(s.authorityKeyId) ?? "", signatureB64: optionalString(s.signatureB64) ?? "" };
}

/**
 * Lenient at the document level (unknown fields ignored), strict about every field the canonical form reads. The
 * timestamps stay strings until the signature check, so that a mixed roster reports its form whatever they hold.
 */
export function parseSignedRoster(document: unknown): SignedRoster {
    const d = object(document);
    const checkpoint = object(d.logCheckpoint);
    return {
        version: int64(d.version),
        issuedAt: string(d.issuedAt),
        entries: list(d.entries).map(parseEntry),
        logCheckpoint: { merkleRoot: string(checkpoint.merkleRoot), size: uint31(checkpoint.size) },
        authoritySignatures: list(d.authoritySignatures).map(parseSignature),
    };
}

/** The form follows the served JSON: no entry with searchVisibility is legacy, every entry is v1, a mix is refused. */
export function detectRosterForm(roster: SignedRoster): RosterForm {
    const withField = roster.entries.filter((e) => e.homeserver.hasSearchVisibility).length;
    if (withField === 0) return "legacy";
    return withField === roster.entries.length ? "v1" : "mixed";
}

function sortedJoined(values: string[] | null): string {
    return values === null ? "" : [...values].sort(compareUtf16).join("|");
}

function canonicalClaim(c: RosterClaim): string {
    const attrs =
        c.attributeMatch === null
            ? ""
            : Object.keys(c.attributeMatch)
                  .sort(compareUtf16)
                  .map((k) => `${k}=${c.attributeMatch![k]}`)
                  .join("|");
    return [
        `country=${nz(c.country)}`,
        `mccmnc=${nz(c.mccmnc)}`,
        `carrier=${nz(c.carrier)}`,
        `prefixes=${sortedJoined(c.phonePrefixes)}`,
        `affiliation=${nz(c.affiliation)}`,
        `attrs=${attrs}`,
        `remote=${nz(c.remoteClaimUrl)}`,
        `priority=${c.priority}`,
    ].join(",");
}

function canonicalClaims(claims: RosterClaim[]): string {
    if (claims.length === 0) return "[]";
    return [...claims]
        .sort(
            (a, b) =>
                a.priority - b.priority ||
                compareUtf16(nz(a.country), nz(b.country)) ||
                compareUtf16(nz(a.mccmnc), nz(b.mccmnc)) ||
                compareUtf16(nz(a.affiliation), nz(b.affiliation)),
        )
        .map(canonicalClaim)
        .join(";");
}

/** Java's StringJoiner writes a null as the four characters "null". */
function joined(value: string | null): string {
    return value ?? "null";
}

function canonicalEntry(e: RosterEntry, searchFields: boolean): string {
    const h = e.homeserver;
    const fields = [
        joined(h.id),
        joined(h.serverName),
        joined(h.baseUrl),
        joined(h.masIssuer),
        nz(h.region),
        String(h.weight),
        String(h.acceptsNew),
        nz(h.signingKey),
    ];
    if (searchFields) {
        fields.push(h.searchVisibility ?? "GLOBAL", sortedJoined(h.searchGroups ?? []));
    }
    fields.push(
        e.admittedAt === null ? "" : String(instantToEpochMs(e.admittedAt)),
        e.status,
        canonicalClaims(e.claims),
    );
    return fields.join(FIELD_SEPARATOR);
}

/** The gua-roster.v1 text the authority signs, in the v1 or the legacy form. */
export function canonicalRosterText(roster: SignedRoster, form: "v1" | "legacy"): string {
    let text = "gua-roster.v1\n";
    text += `version=${roster.version}\n`;
    text += `issuedAt=${instantToEpochMs(roster.issuedAt)}\n`;
    text += `log=${roster.logCheckpoint.merkleRoot}:${roster.logCheckpoint.size}\n`;
    const entries = [...roster.entries].sort((a, b) => compareUtf16(joined(a.homeserver.id), joined(b.homeserver.id)));
    for (const entry of entries) text += canonicalEntry(entry, form === "v1") + "\n";
    return text;
}

export function canonicalRosterBytes(roster: SignedRoster, form: "v1" | "legacy"): Uint8Array {
    return utf8Bytes(canonicalRosterText(roster, form));
}

/** rosterSignature over the bytes of `form`, which a client detects from the served JSON; a mixed form is refused. */
export async function checkRosterSignature(
    roster: SignedRoster,
    form: RosterForm,
    authority: TrustedKeySet,
    threshold: number,
): Promise<CheckResult> {
    if (form === "mixed") return unverifiable(Reason.MixedRosterForm);
    let bytes: Uint8Array;
    try {
        bytes = canonicalRosterBytes(roster, form);
    } catch (e) {
        if (e instanceof ParseError) return unverifiable(Reason.ParseError);
        throw e;
    }
    const votes = await authority.countVotes(bytes, roster.authoritySignatures);
    const failure = signatureFailure(votes, threshold);
    return failure ? invalid(failure) : { outcome: "valid" };
}

export function activeEntries(roster: SignedRoster): RosterEntry[] {
    return roster.entries.filter((e) => e.status === "ACTIVE");
}

/** The fields of a /resolve answer a roster entry must carry; region is not compared. */
export interface AnswerFields {
    serverName: string;
    baseUrl: string;
    masIssuer: string | null;
}

export function hasAnswerFields(h: RosterHomeserver, answer: AnswerFields): boolean {
    return h.serverName === answer.serverName && h.baseUrl === answer.baseUrl && h.masIssuer === answer.masIssuer;
}

export type LocatedHomeserver =
    | { match: "ACTIVE_MATCH" | "INACTIVE" | "FIELD_MISMATCH"; entry: RosterEntry }
    | { match: "NOT_IN_ROSTER"; entry: null };

/**
 * ResolverVerifier.locate: an ACTIVE entry with all three fields, then any entry with all three, then any entry with
 * the server name. The strongest match wins whatever the entry order, and a tie goes to the entry served first.
 */
export function locateHomeserver(answer: AnswerFields, roster: SignedRoster): LocatedHomeserver {
    const named = roster.entries.filter((e) => e.homeserver.serverName === answer.serverName);
    const sameFields = named.filter((e) => hasAnswerFields(e.homeserver, answer));
    const active = sameFields.find((e) => e.status === "ACTIVE");
    if (active) return { match: "ACTIVE_MATCH", entry: active };
    if (sameFields.length > 0) return { match: "INACTIVE", entry: sameFields[0] };
    if (named.length > 0) return { match: "FIELD_MISMATCH", entry: named[0] };
    return { match: "NOT_IN_ROSTER", entry: null };
}
