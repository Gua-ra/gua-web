/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type HomeserverMatch, type RosterForm } from "./report";
import { utf8Bytes } from "./ed25519";

const FIELD_SEPARATOR = "\u001f";
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

export class RosterParseError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "RosterParseError";
    }
}

export interface ParsedInstant {
    /** Epoch milliseconds, the fraction truncated to three digits. */
    epochMs: number;
    /** False when the fraction carries non-zero digits beyond milliseconds. */
    exactMillis: boolean;
}

/** ISO-8601 UTC with 0 to 9 fractional digits, computed with integer arithmetic only. */
export function parseInstant(iso: string): ParsedInstant | null {
    const m = INSTANT_PATTERN.exec(iso);
    if (!m) return null;
    const [year, month, day, hour, minute, second] = m.slice(1, 7).map((s) => parseInt(s, 10));
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    if (hour > 23 || minute > 59 || second > 59) return null;
    const fraction = m[7] ?? "";
    const millis = parseInt((fraction + "000").substring(0, 3), 10);
    const exactMillis = !/[1-9]/.test(fraction.substring(3));
    const days = daysFromCivil(year, month, day);
    return { epochMs: (days * 86400 + hour * 3600 + minute * 60 + second) * 1000 + millis, exactMillis };
}

export function instantToEpochMs(iso: string): number {
    const parsed = parseInstant(iso);
    if (!parsed) throw new RosterParseError("invalid instant");
    return parsed.epochMs;
}

function daysInMonth(year: number, month: number): number {
    if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysFromCivil(year: number, month: number, day: number): number {
    const y = month <= 2 ? year - 1 : year;
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
}

/** Java String.compareTo: UTF-16 code unit order, which is also what JavaScript's < gives. */
export function compareUtf16(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

export function nz(value: string | null | undefined): string {
    return value ?? "";
}

export interface RosterHomeserver {
    id: string;
    serverName: string;
    baseUrl: string;
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
    /** The member block exactly as served, parsed strictly by the member-entry verifier. */
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
    authoritySignatures: { authorityKeyId: string; signatureB64: string }[];
}

type Json = Record<string, unknown>;

function asObject(value: unknown, what: string): Json {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new RosterParseError(`${what} is not an object`);
    }
    return value as Json;
}

function asString(value: unknown, what: string): string {
    if (typeof value !== "string") throw new RosterParseError(`${what} is not a string`);
    return value;
}

function optionalString(value: unknown, what: string): string | null {
    return value === undefined || value === null ? null : asString(value, what);
}

function asInteger(value: unknown, what: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RosterParseError(`${what} is not a number`);
    return Math.trunc(value);
}

function optionalStringList(value: unknown, what: string): string[] | null {
    if (value === undefined || value === null) return null;
    if (!Array.isArray(value)) throw new RosterParseError(`${what} is not a list`);
    return value.map((v, i) => asString(v, `${what}[${i}]`));
}

function parseHomeserver(value: unknown): RosterHomeserver {
    const h = asObject(value, "homeserver");
    return {
        id: asString(h.id, "homeserver.id"),
        serverName: asString(h.serverName, "homeserver.serverName"),
        baseUrl: asString(h.baseUrl, "homeserver.baseUrl"),
        masIssuer: optionalString(h.masIssuer, "homeserver.masIssuer"),
        region: optionalString(h.region, "homeserver.region"),
        weight: h.weight === undefined || h.weight === null ? 0 : asInteger(h.weight, "homeserver.weight"),
        acceptsNew: h.acceptsNew === true,
        signingKey: optionalString(h.signingKey, "homeserver.signingKey"),
        searchVisibility: optionalString(h.searchVisibility, "homeserver.searchVisibility"),
        searchGroups: optionalStringList(h.searchGroups, "homeserver.searchGroups"),
        hasSearchVisibility: Object.prototype.hasOwnProperty.call(h, "searchVisibility"),
    };
}

function parseClaim(value: unknown): RosterClaim {
    const c = asObject(value, "claim");
    let attributeMatch: Record<string, string> | null = null;
    if (c.attributeMatch !== undefined && c.attributeMatch !== null) {
        attributeMatch = {};
        for (const [k, v] of Object.entries(asObject(c.attributeMatch, "claim.attributeMatch"))) {
            attributeMatch[k] = asString(v, `claim.attributeMatch.${k}`);
        }
    }
    return {
        country: optionalString(c.country, "claim.country"),
        mccmnc: optionalString(c.mccmnc, "claim.mccmnc"),
        carrier: optionalString(c.carrier, "claim.carrier"),
        phonePrefixes: optionalStringList(c.phonePrefixes, "claim.phonePrefixes"),
        affiliation: optionalString(c.affiliation, "claim.affiliation"),
        attributeMatch,
        remoteClaimUrl: optionalString(c.remoteClaimUrl, "claim.remoteClaimUrl"),
        priority: c.priority === undefined || c.priority === null ? 0 : asInteger(c.priority, "claim.priority"),
    };
}

function parseEntry(value: unknown): RosterEntry {
    const e = asObject(value, "entry");
    const claims = e.claims === undefined || e.claims === null ? [] : e.claims;
    if (!Array.isArray(claims)) throw new RosterParseError("entry.claims is not a list");
    return {
        homeserver: parseHomeserver(e.homeserver),
        claims: claims.map(parseClaim),
        admittedAt: optionalString(e.admittedAt, "entry.admittedAt"),
        status: asString(e.status, "entry.status"),
        member: e.member === null ? undefined : e.member,
    };
}

/** Lenient at the document level (unknown fields ignored), strict about every field the canonical form reads. */
export function parseSignedRoster(document: unknown): SignedRoster {
    const d = asObject(document, "roster");
    const checkpoint = asObject(d.logCheckpoint, "roster.logCheckpoint");
    const signatures = d.authoritySignatures ?? [];
    if (!Array.isArray(signatures)) throw new RosterParseError("roster.authoritySignatures is not a list");
    if (!Array.isArray(d.entries)) throw new RosterParseError("roster.entries is not a list");
    const issuedAt = asString(d.issuedAt, "roster.issuedAt");
    if (!parseInstant(issuedAt)) throw new RosterParseError("roster.issuedAt is not an instant");
    const entries = d.entries.map(parseEntry);
    for (const entry of entries) {
        if (entry.admittedAt !== null && !parseInstant(entry.admittedAt)) {
            throw new RosterParseError("entry.admittedAt is not an instant");
        }
    }
    return {
        version: asInteger(d.version, "roster.version"),
        issuedAt,
        entries,
        logCheckpoint: {
            merkleRoot: asString(checkpoint.merkleRoot, "logCheckpoint.merkleRoot"),
            size: asInteger(checkpoint.size, "logCheckpoint.size"),
        },
        authoritySignatures: signatures.map((s, i) => {
            const sig = asObject(s, `authoritySignatures[${i}]`);
            return {
                authorityKeyId: asString(sig.authorityKeyId, "authoritySignature.authorityKeyId"),
                signatureB64: asString(sig.signatureB64, "authoritySignature.signatureB64"),
            };
        }),
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

function canonicalEntry(e: RosterEntry, searchFields: boolean): string {
    const h = e.homeserver;
    const fields = [
        h.id,
        h.serverName,
        h.baseUrl,
        h.masIssuer ?? "null",
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
    const entries = [...roster.entries].sort((a, b) => compareUtf16(a.homeserver.id, b.homeserver.id));
    for (const entry of entries) text += canonicalEntry(entry, form === "v1") + "\n";
    return text;
}

export function canonicalRosterBytes(roster: SignedRoster, form: "v1" | "legacy"): Uint8Array {
    return utf8Bytes(canonicalRosterText(roster, form));
}

export function activeEntries(roster: SignedRoster): RosterEntry[] {
    return roster.entries.filter((e) => e.status === "ACTIVE");
}

export interface LocatedHomeserver {
    match: HomeserverMatch;
    entry: RosterEntry | null;
}

/** ResolverVerifier.locate: only an ACTIVE entry with exactly these fields may be connected to. */
export function locateHomeserver(
    serverName: string,
    baseUrl: string,
    masIssuer: string | null,
    roster: SignedRoster,
): LocatedHomeserver {
    let best: LocatedHomeserver = { match: "NOT_IN_ROSTER", entry: null };
    for (const entry of roster.entries) {
        const h = entry.homeserver;
        if (h.serverName !== serverName) continue;
        const sameEndpoint = h.baseUrl === baseUrl && h.masIssuer === masIssuer;
        if (sameEndpoint && entry.status === "ACTIVE") return { match: "ACTIVE_MATCH", entry };
        best = { match: sameEndpoint ? "INACTIVE" : "FIELD_MISMATCH", entry };
    }
    return best;
}
