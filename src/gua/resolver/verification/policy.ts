/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { compareUtf16, type LogCheckpoint, nz } from "./canonical";
import { type Signature, signatureFailure, type TrustedKeySet, utf8Bytes, type VerifierCrypto } from "./ed25519";
import {
    instantToEpochMs,
    int32,
    int64,
    list,
    object,
    optionalBoolean,
    optionalInstant,
    optionalString,
    optionalStringList,
} from "./json";
import { type LogEvent, MerkleTree } from "./merkle";
import { type CheckResult, invalid, Reason, unverifiable } from "./report";

const FIELD_SEPARATOR = "\u001f";
const POLICY_PUBLISH = "POLICY_PUBLISH";

export interface DelegationZone {
    id: string | null;
    scopeType: string | null;
    scopeValue: string | null;
    delegatedAuthority: string | null;
    delegateKeyId: string | null;
    delegatePublicKey: string | null;
    allowedHomeserverIds: string[] | null;
    notBefore: string | null;
    expiresAt: string | null;
}

export interface RoutingPolicyRule {
    id: string | null;
    priority: number;
    matchType: string | null;
    matchValue: string | null;
    oidcIssuer: string | null;
    oidcClaim: string | null;
    targetHomeserverId: string | null;
    delegatedZoneId: string | null;
    reason: string | null;
    assignmentPolicy: string | null;
    enabled: boolean | null;
}

export interface RoutingPolicyBundle {
    schemaVersion: string | null;
    policyId: string | null;
    version: number;
    issuedAt: string | null;
    notBefore: string | null;
    expiresAt: string | null;
    delegationZones: DelegationZone[];
    rules: RoutingPolicyRule[];
    fallback: { type: string | null; enabled: boolean } | null;
    signatures: Signature[];
    delegateSignatures: DelegateSignature[];
}

export interface DelegateSignature {
    zoneId: string | null;
    delegateKeyId: string | null;
    signatureB64: string | null;
}

function parseZone(value: unknown): DelegationZone {
    const z = object(value);
    return {
        id: optionalString(z.id),
        scopeType: optionalString(z.scopeType),
        scopeValue: optionalString(z.scopeValue),
        delegatedAuthority: optionalString(z.delegatedAuthority),
        delegateKeyId: optionalString(z.delegateKeyId),
        delegatePublicKey: optionalString(z.delegatePublicKey),
        allowedHomeserverIds: optionalStringList(z.allowedHomeserverIds),
        notBefore: optionalInstant(z.notBefore),
        expiresAt: optionalInstant(z.expiresAt),
    };
}

function parseRule(value: unknown): RoutingPolicyRule {
    const r = object(value);
    return {
        id: optionalString(r.id),
        priority: int32(r.priority ?? 0),
        matchType: optionalString(r.matchType),
        matchValue: optionalString(r.matchValue),
        oidcIssuer: optionalString(r.oidcIssuer),
        oidcClaim: optionalString(r.oidcClaim),
        targetHomeserverId: optionalString(r.targetHomeserverId),
        delegatedZoneId: optionalString(r.delegatedZoneId),
        reason: optionalString(r.reason),
        assignmentPolicy: optionalString(r.assignmentPolicy),
        enabled: optionalBoolean(r.enabled),
    };
}

function parseSignature(value: unknown): Signature {
    const s = object(value);
    return { keyId: optionalString(s.authorityKeyId) ?? "", signatureB64: optionalString(s.signatureB64) ?? "" };
}

function parseDelegateSignature(value: unknown): DelegateSignature {
    const s = object(value);
    return {
        zoneId: optionalString(s.zoneId),
        delegateKeyId: optionalString(s.delegateKeyId),
        signatureB64: optionalString(s.signatureB64),
    };
}

export function parseRoutingPolicy(document: unknown): RoutingPolicyBundle {
    const d = object(document);
    const fallback = d.fallback === undefined || d.fallback === null ? null : object(d.fallback);
    return {
        schemaVersion: optionalString(d.schemaVersion),
        policyId: optionalString(d.policyId),
        version: int64(d.version ?? 0),
        issuedAt: optionalInstant(d.issuedAt),
        notBefore: optionalInstant(d.notBefore),
        expiresAt: optionalInstant(d.expiresAt),
        delegationZones: list(d.delegationZones ?? []).map(parseZone),
        rules: list(d.rules ?? []).map(parseRule),
        fallback: fallback && {
            type: optionalString(fallback.type),
            enabled: optionalBoolean(fallback.enabled) ?? false,
        },
        signatures: list(d.signatures ?? []).map(parseSignature),
        delegateSignatures: list(d.delegateSignatures ?? []).map(parseDelegateSignature),
    };
}

/**
 * A bundle or zone is in effect from notBefore, inclusive, until expiresAt, exclusive. A missing bound is open, and so
 * is one at the epoch, because the signed bytes write both as 0.
 */
export function inEffect(notBefore: string | null, expiresAt: string | null, atEpochMs: number): boolean {
    const from = epoch(notBefore);
    const until = epoch(expiresAt);
    return (from === 0 || from <= atEpochMs) && (until === 0 || atEpochMs < until);
}

function epoch(iso: string | null): number {
    return iso === null ? 0 : instantToEpochMs(iso);
}

function compareNullsLast(a: string | null, b: string | null): number {
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return compareUtf16(a, b);
}

/** Deterministic rule order (priority, then id with nulls last), shared with the delegated-rules form. */
export function sortedRules(rules: RoutingPolicyRule[]): RoutingPolicyRule[] {
    return [...rules].sort((a, b) => a.priority - b.priority || compareNullsLast(a.id, b.id));
}

export function isRuleEnabled(rule: RoutingPolicyRule): boolean {
    return rule.enabled === null || rule.enabled;
}

function ruleLine(r: RoutingPolicyRule): string {
    return [
        "rule",
        nz(r.id),
        String(r.priority),
        nz(r.matchType),
        nz(r.matchValue),
        nz(r.oidcIssuer),
        nz(r.oidcClaim),
        nz(r.targetHomeserverId),
        nz(r.delegatedZoneId),
        nz(r.reason),
        r.assignmentPolicy ?? "PORTABLE",
        String(isRuleEnabled(r)),
    ].join(FIELD_SEPARATOR);
}

function zoneLine(z: DelegationZone): string {
    return [
        "zone",
        nz(z.id),
        nz(z.scopeType),
        nz(z.scopeValue),
        nz(z.delegatedAuthority),
        nz(z.delegateKeyId),
        nz(z.delegatePublicKey),
        z.allowedHomeserverIds === null ? "" : [...z.allowedHomeserverIds].sort(compareUtf16).join("|"),
        String(epoch(z.notBefore)),
        String(epoch(z.expiresAt)),
    ].join(FIELD_SEPARATOR);
}

/** CanonicalRoutingPolicy: the gua-routing-policy.v1 text the authority signs, signatures excluded. */
export function canonicalPolicyText(bundle: RoutingPolicyBundle): string {
    let text = "gua-routing-policy.v1\n";
    text += `schema=${nz(bundle.schemaVersion)}\n`;
    text += `policyId=${nz(bundle.policyId)}\n`;
    text += `version=${bundle.version}\n`;
    text += `issuedAt=${epoch(bundle.issuedAt)}\n`;
    text += `notBefore=${epoch(bundle.notBefore)}\n`;
    text += `expiresAt=${epoch(bundle.expiresAt)}\n`;
    const zones = [...bundle.delegationZones].sort((a, b) => compareNullsLast(a.id, b.id));
    for (const zone of zones) text += zoneLine(zone) + "\n";
    for (const rule of sortedRules(bundle.rules)) text += ruleLine(rule) + "\n";
    const f = bundle.fallback;
    text += `fallback=${f === null ? "" : `${nz(f.type)}:${f.enabled}`}\n`;
    return text;
}

export function canonicalPolicyBytes(bundle: RoutingPolicyBundle): Uint8Array {
    return utf8Bytes(canonicalPolicyText(bundle));
}

/** CanonicalDelegatedRules: what a zone's delegate signs, bound to policyId, version and zoneId. */
export function canonicalDelegatedRulesText(
    policyId: string | null,
    version: number,
    zoneId: string | null,
    rules: RoutingPolicyRule[],
): string {
    let text = "gua-delegated-rules.v1\n";
    text += `policyId=${nz(policyId)}\n`;
    text += `version=${version}\n`;
    text += `zoneId=${nz(zoneId)}\n`;
    for (const rule of sortedRules(rules)) {
        if (zoneId !== null && rule.delegatedZoneId === zoneId) text += ruleLine(rule) + "\n";
    }
    return text;
}

export function canonicalDelegatedRulesBytes(
    policyId: string | null,
    version: number,
    zoneId: string | null,
    rules: RoutingPolicyRule[],
): Uint8Array {
    return utf8Bytes(canonicalDelegatedRulesText(policyId, version, zoneId, rules));
}

/**
 * The zones whose delegate signed their rules under the key the authority attested. A delegate key that is malformed
 * or that the platform will not import verifies no zone.
 */
export async function delegateVerifiedZones(crypto: VerifierCrypto, bundle: RoutingPolicyBundle): Promise<Set<string>> {
    const verified = new Set<string>();
    for (const zone of bundle.delegationZones) {
        if (zone.id === null || blank(zone.delegateKeyId) || blank(zone.delegatePublicKey)) continue;
        const delegateKey = await crypto.importPublicKey(zone.delegatePublicKey!);
        if (!delegateKey) continue;
        const canonical = canonicalDelegatedRulesBytes(bundle.policyId, bundle.version, zone.id, bundle.rules);
        for (const sig of bundle.delegateSignatures) {
            if (sig.zoneId !== zone.id || sig.delegateKeyId !== zone.delegateKeyId || sig.signatureB64 === null) {
                continue;
            }
            if (await crypto.verify(delegateKey, canonical, sig.signatureB64)) {
                verified.add(zone.id);
                break;
            }
        }
    }
    return verified;
}

function blank(value: string | null): boolean {
    return value === null || value.trim() === "";
}

/** Signed by the threshold of policy keys, with no fallback to the authority keys. Null when that holds. */
export async function policySignatureFailure(
    keys: TrustedKeySet,
    bundle: RoutingPolicyBundle,
    canonical: Uint8Array,
    threshold: number,
): Promise<CheckResult | null> {
    if (keys.size === 0) return unverifiable(Reason.NoPolicyKeys);
    const failure = signatureFailure(await keys.countVotes(canonical, bundle.signatures), threshold);
    return failure ? invalid(failure) : null;
}

/** What the log has to say about a served bundle: its id, version and the SHA-256 of its canonical bytes. */
export interface PublishedPolicy {
    policyId: string | null;
    version: number;
    sha256Hex: string;
}

/** The version a POLICY_PUBLISH leaf names for this policy id. Its subject is "<policyId>:v<version>". */
function publishedVersion(event: LogEvent, policyId: string | null): number | null {
    const subject = event.homeserverId ?? "";
    const at = subject.lastIndexOf(":v");
    if (at < 0 || subject.slice(0, at) !== policyId) return null;
    const version = subject.slice(at + 2);
    return /^\d+$/.test(version) ? Number(version) : null;
}

/**
 * The policy check's log step for a served bundle, or for a 404 when `served` is null. The leaves the signed
 * checkpoint covers must hash to its root in served order; a 404 is no policy only while none of them is a
 * POLICY_PUBLISH, since otherwise a published policy is being withheld.
 */
export async function policyLogOutcome(
    crypto: VerifierCrypto,
    served: PublishedPolicy | null,
    checkpoint: LogCheckpoint,
    events: LogEvent[],
): Promise<CheckResult> {
    if (events.length < checkpoint.size) return invalid(Reason.LogMismatch);
    const covered = events.slice(0, checkpoint.size);
    const merkle = new MerkleTree(crypto);
    const leaves: string[] = [];
    for (const event of covered) leaves.push(await merkle.leafHash(MerkleTree.leafData(event)));
    if ((await merkle.root(leaves)) !== checkpoint.merkleRoot) return invalid(Reason.LogMismatch);
    const publications = covered.filter((e) => e.type === POLICY_PUBLISH);
    if (!served) return publications.length > 0 ? unverifiable(Reason.PolicyNotServed) : { outcome: "notPresent" };

    const position = events.findIndex((e) => e.type === POLICY_PUBLISH && e.payloadHash === served.sha256Hex);
    if (position === -1) return invalid(Reason.PolicyNotLogged);
    if (position >= checkpoint.size) return unverifiable(Reason.PolicyNewerThanCheckpoint);
    const superseded = publications.some((e) => (publishedVersion(e, served.policyId) ?? -1) > served.version);
    return superseded ? unverifiable(Reason.PolicySuperseded) : { outcome: "valid" };
}
