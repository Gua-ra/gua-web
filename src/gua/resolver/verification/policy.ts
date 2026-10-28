/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { compareUtf16, instantToEpochMs, nz, parseInstant } from "./canonical";
import { type TrustedKeySet, utf8Bytes, type VerifierCrypto } from "./ed25519";

const FIELD_SEPARATOR = "\u001f";

export class PolicyParseError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "PolicyParseError";
    }
}

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
    signatures: { authorityKeyId: string; signatureB64: string }[];
    delegateSignatures: { zoneId: string | null; delegateKeyId: string | null; signatureB64: string | null }[];
}

type Json = Record<string, unknown>;

function asObject(value: unknown, what: string): Json {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new PolicyParseError(`${what} is not an object`);
    }
    return value as Json;
}

function asList(value: unknown, what: string): unknown[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new PolicyParseError(`${what} is not a list`);
    return value;
}

function optionalString(value: unknown, what: string): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") throw new PolicyParseError(`${what} is not a string`);
    return value;
}

function optionalInstant(value: unknown, what: string): string | null {
    const text = optionalString(value, what);
    if (text !== null && !parseInstant(text)) throw new PolicyParseError(`${what} is not an instant`);
    return text;
}

function integer(value: unknown, what: string): number {
    if (value === undefined || value === null) return 0;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new PolicyParseError(`${what} is not a number`);
    return Math.trunc(value);
}

function optionalStringList(value: unknown, what: string): string[] | null {
    if (value === undefined || value === null) return null;
    return asList(value, what).map((v, i) => optionalString(v, `${what}[${i}]`) ?? "");
}

function parseZone(value: unknown): DelegationZone {
    const z = asObject(value, "zone");
    return {
        id: optionalString(z.id, "zone.id"),
        scopeType: optionalString(z.scopeType, "zone.scopeType"),
        scopeValue: optionalString(z.scopeValue, "zone.scopeValue"),
        delegatedAuthority: optionalString(z.delegatedAuthority, "zone.delegatedAuthority"),
        delegateKeyId: optionalString(z.delegateKeyId, "zone.delegateKeyId"),
        delegatePublicKey: optionalString(z.delegatePublicKey, "zone.delegatePublicKey"),
        allowedHomeserverIds: optionalStringList(z.allowedHomeserverIds, "zone.allowedHomeserverIds"),
        notBefore: optionalInstant(z.notBefore, "zone.notBefore"),
        expiresAt: optionalInstant(z.expiresAt, "zone.expiresAt"),
    };
}

function parseRule(value: unknown): RoutingPolicyRule {
    const r = asObject(value, "rule");
    if (r.enabled !== undefined && r.enabled !== null && typeof r.enabled !== "boolean") {
        throw new PolicyParseError("rule.enabled is not a boolean");
    }
    return {
        id: optionalString(r.id, "rule.id"),
        priority: integer(r.priority, "rule.priority"),
        matchType: optionalString(r.matchType, "rule.matchType"),
        matchValue: optionalString(r.matchValue, "rule.matchValue"),
        oidcIssuer: optionalString(r.oidcIssuer, "rule.oidcIssuer"),
        oidcClaim: optionalString(r.oidcClaim, "rule.oidcClaim"),
        targetHomeserverId: optionalString(r.targetHomeserverId, "rule.targetHomeserverId"),
        delegatedZoneId: optionalString(r.delegatedZoneId, "rule.delegatedZoneId"),
        reason: optionalString(r.reason, "rule.reason"),
        assignmentPolicy: optionalString(r.assignmentPolicy, "rule.assignmentPolicy"),
        enabled: (r.enabled as boolean | undefined | null) ?? null,
    };
}

export function parseRoutingPolicy(document: unknown): RoutingPolicyBundle {
    const d = asObject(document, "policy");
    const fallback = d.fallback === undefined || d.fallback === null ? null : asObject(d.fallback, "policy.fallback");
    return {
        schemaVersion: optionalString(d.schemaVersion, "policy.schemaVersion"),
        policyId: optionalString(d.policyId, "policy.policyId"),
        version: integer(d.version, "policy.version"),
        issuedAt: optionalInstant(d.issuedAt, "policy.issuedAt"),
        notBefore: optionalInstant(d.notBefore, "policy.notBefore"),
        expiresAt: optionalInstant(d.expiresAt, "policy.expiresAt"),
        delegationZones: asList(d.delegationZones, "policy.delegationZones").map(parseZone),
        rules: asList(d.rules, "policy.rules").map(parseRule),
        fallback:
            fallback === null
                ? null
                : { type: optionalString(fallback.type, "fallback.type"), enabled: fallback.enabled === true },
        signatures: asList(d.signatures, "policy.signatures").map((s, i) => {
            const sig = asObject(s, `signatures[${i}]`);
            return {
                authorityKeyId: optionalString(sig.authorityKeyId, "signature.authorityKeyId") ?? "",
                signatureB64: optionalString(sig.signatureB64, "signature.signatureB64") ?? "",
            };
        }),
        delegateSignatures: asList(d.delegateSignatures, "policy.delegateSignatures").map((s, i) => {
            const sig = asObject(s, `delegateSignatures[${i}]`);
            return {
                zoneId: optionalString(sig.zoneId, "delegateSignature.zoneId"),
                delegateKeyId: optionalString(sig.delegateKeyId, "delegateSignature.delegateKeyId"),
                signatureB64: optionalString(sig.signatureB64, "delegateSignature.signatureB64"),
            };
        }),
    };
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
 * RoutingPolicyVerifier as a client runs it: the configured policy keys are the only authority trust root,
 * and a rule is trusted only when its zone's delegate signed the rules under the key the authority attested.
 */
export class PolicyVerifier {
    public constructor(
        private readonly crypto: VerifierCrypto,
        private readonly keys: TrustedKeySet,
        private readonly threshold: number,
    ) {}

    public async isVerified(bundle: RoutingPolicyBundle): Promise<boolean> {
        const votes = await this.keys.countVotes(
            canonicalPolicyBytes(bundle),
            bundle.signatures.map((s) => ({ keyId: s.authorityKeyId, signatureB64: s.signatureB64 })),
        );
        return votes.valid >= Math.max(1, this.threshold);
    }

    public async delegateVerifiedZones(bundle: RoutingPolicyBundle): Promise<Set<string>> {
        const verified = new Set<string>();
        for (const zone of bundle.delegationZones) {
            if (zone.id === null || blank(zone.delegateKeyId) || blank(zone.delegatePublicKey)) continue;
            const delegateKey = await this.crypto.importPublicKey(zone.delegatePublicKey!);
            if (!delegateKey) continue;
            const canonical = canonicalDelegatedRulesBytes(bundle.policyId, bundle.version, zone.id, bundle.rules);
            for (const sig of bundle.delegateSignatures) {
                if (sig.zoneId !== zone.id || sig.delegateKeyId !== zone.delegateKeyId || sig.signatureB64 === null) {
                    continue;
                }
                if (await this.crypto.verify(delegateKey, canonical, sig.signatureB64)) {
                    verified.add(zone.id);
                    break;
                }
            }
        }
        return verified;
    }
}

function blank(value: string | null): boolean {
    return value === null || value.trim() === "";
}
