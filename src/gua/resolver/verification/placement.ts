/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    activeEntries,
    compareUtf16,
    instantToEpochMs,
    nz,
    type RosterClaim,
    type RosterHomeserver,
    type SignedRoster,
} from "./canonical";
import { utf8Bytes, type VerifierCrypto } from "./ed25519";
import { type DelegationZone, isRuleEnabled, type RoutingPolicyBundle, type RoutingPolicyRule } from "./policy";

/** What the client knows about a placement: the phone, and nothing a verified claims envelope would add. */
export interface PlacementContext {
    phone: string | null;
    country: string | null;
    mccmnc: string | null;
    carrier: string | null;
    regionHint: string | null;
    affiliations: string[];
    attributes: Record<string, string>;
}

export interface PlacementDecision {
    homeserverId: string;
    rule: "PolicyRoutingRule" | "ClaimRule" | "WeightedFallbackRule";
    ruleId: string;
}

/** A policy whose authority signatures verified, with the zones whose delegate signatures verified. */
export interface VerifiedPolicy {
    bundle: RoutingPolicyBundle;
    delegateVerifiedZones: Set<string>;
}

export function phoneContext(phone: string): PlacementContext {
    return {
        phone,
        country: null,
        mccmnc: null,
        carrier: null,
        regionHint: null,
        affiliations: [],
        attributes: {},
    };
}

/** PlacementContext.canonicalRoutingKey: the bucketing key the weighted fallback hashes. */
export function routingKey(ctx: PlacementContext): string {
    let key = `phone=${nz(ctx.phone)}\n`;
    key += `country=${nz(ctx.country)}\n`;
    key += `mccmnc=${nz(ctx.mccmnc)}\n`;
    key += `carrier=${nz(ctx.carrier)}\n`;
    key += `region=${nz(ctx.regionHint)}\n`;
    key += `affiliations=${[...ctx.affiliations].sort(compareUtf16).join("|")}\n`;
    key += "attrs=";
    for (const k of Object.keys(ctx.attributes).sort(compareUtf16)) key += `${k}=${ctx.attributes[k]}|`;
    return key;
}

export function placementCandidates(roster: SignedRoster): RosterHomeserver[] {
    return activeEntries(roster)
        .map((e) => e.homeserver)
        .filter((h) => h.acceptsNew)
        .sort((a, b) => compareUtf16(a.id, b.id));
}

/** WeightedFallbackRule.stableHash: the first four bytes of the digest as a signed 32-bit integer. */
export async function stableHash(
    crypto: VerifierCrypto,
    ctx: PlacementContext,
    rosterVersion: number,
    candidates: RosterHomeserver[],
): Promise<number> {
    let input = `weighted-fallback.v1\nroster=${rosterVersion}\n` + routingKey(ctx);
    for (const hs of candidates) input += `\n${hs.id}:${Math.max(0, hs.weight)}`;
    const digest = await crypto.sha256(utf8Bytes(input));
    return (digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3] | 0;
}

function floorMod(value: number, modulo: number): number {
    return ((value % modulo) + modulo) % modulo;
}

function equalsIgnoreCase(a: string, b: string | null): boolean {
    return b !== null && a.toUpperCase() === b.toUpperCase();
}

/** ClaimPredicate.matchesLocally for a context whose claims are never signature-verified. */
function claimMatches(claim: RosterClaim, ctx: PlacementContext): boolean {
    if (claim.country !== null && !equalsIgnoreCase(claim.country, ctx.country)) return false;
    if (claim.mccmnc !== null && claim.mccmnc !== ctx.mccmnc) return false;
    if (claim.carrier !== null && !equalsIgnoreCase(claim.carrier, ctx.carrier)) return false;
    if (claim.phonePrefixes !== null && claim.phonePrefixes.length > 0) {
        const phone = ctx.phone;
        if (phone === null || !claim.phonePrefixes.some((p) => phone.startsWith(p))) return false;
    }
    if (claim.affiliation !== null) return false;
    if (claim.attributeMatch !== null && Object.keys(claim.attributeMatch).length > 0) return false;
    return true;
}

function isRemote(claim: RosterClaim): boolean {
    return claim.remoteClaimUrl !== null && claim.remoteClaimUrl.trim() !== "";
}

function zoneActive(zone: DelegationZone | undefined, nowEpochMs: number): boolean {
    if (!zone) return false;
    if (zone.notBefore !== null && instantToEpochMs(zone.notBefore) > nowEpochMs) return false;
    return zone.expiresAt === null || instantToEpochMs(zone.expiresAt) > nowEpochMs;
}

/** Institution and OIDC rules need signature-verified claims, which a public client never carries. */
function ruleMatches(rule: RoutingPolicyRule, ctx: PlacementContext): boolean {
    return (
        rule.matchType === "PHONE_PREFIX" &&
        rule.matchValue !== null &&
        ctx.phone !== null &&
        ctx.phone.startsWith(rule.matchValue)
    );
}

function policyRule(
    policy: VerifiedPolicy,
    ctx: PlacementContext,
    roster: SignedRoster,
    nowEpochMs: number,
): PlacementDecision | null {
    const targets = new Map(placementCandidates(roster).map((h) => [h.id, h]));
    const zones = new Map<string, DelegationZone>();
    for (const zone of policy.bundle.delegationZones) {
        if (zone.id !== null && !zones.has(zone.id)) zones.set(zone.id, zone);
    }
    const applicable = policy.bundle.rules
        .filter(isRuleEnabled)
        .filter((r) => r.delegatedZoneId !== null && policy.delegateVerifiedZones.has(r.delegatedZoneId))
        .filter((r) => zoneActive(zones.get(r.delegatedZoneId!), nowEpochMs))
        .sort((a, b) => a.priority - b.priority || compareUtf16(nz(a.id), nz(b.id)));
    for (const rule of applicable) {
        if (!ruleMatches(rule, ctx)) continue;
        const target = rule.targetHomeserverId === null ? undefined : targets.get(rule.targetHomeserverId);
        if (target) return { homeserverId: target.id, rule: "PolicyRoutingRule", ruleId: nz(rule.id) };
    }
    return null;
}

function claimRule(ctx: PlacementContext, roster: SignedRoster): PlacementDecision | null {
    let best: { homeserverId: string; priority: number } | null = null;
    for (const entry of activeEntries(roster)) {
        if (!entry.homeserver.acceptsNew) continue;
        for (const claim of entry.claims) {
            if (isRemote(claim) || !claimMatches(claim, ctx)) continue;
            const candidate = { homeserverId: entry.homeserver.id, priority: claim.priority };
            if (
                best === null ||
                candidate.priority - best.priority < 0 ||
                (candidate.priority === best.priority && compareUtf16(candidate.homeserverId, best.homeserverId) < 0)
            ) {
                best = candidate;
            }
        }
    }
    if (!best) return null;
    return {
        homeserverId: best.homeserverId,
        rule: "ClaimRule",
        ruleId: `roster-claim:${best.homeserverId}:${best.priority}`,
    };
}

async function weightedFallback(
    crypto: VerifierCrypto,
    ctx: PlacementContext,
    roster: SignedRoster,
): Promise<PlacementDecision | null> {
    const candidates = placementCandidates(roster);
    if (candidates.length === 0) return null;
    const hash = await stableHash(crypto, ctx, roster.version, candidates);
    const totalWeight = candidates.reduce((sum, hs) => sum + Math.max(0, hs.weight), 0);
    let chosen = candidates[candidates.length - 1];
    if (totalWeight <= 0) {
        chosen = candidates[floorMod(hash, candidates.length)];
    } else {
        const target = floorMod(hash, totalWeight);
        let cumulative = 0;
        for (const hs of candidates) {
            cumulative += Math.max(0, hs.weight);
            if (target < cumulative) {
                chosen = hs;
                break;
            }
        }
    }
    return { homeserverId: chosen.id, rule: "WeightedFallbackRule", ruleId: "weighted-fallback" };
}

/** The resolver's placement pipeline over verified artifacts: policy rules, roster claims, weighted fallback. */
export async function reproducePlacement(
    crypto: VerifierCrypto,
    ctx: PlacementContext,
    roster: SignedRoster,
    policy: VerifiedPolicy | null,
    nowEpochMs: number,
): Promise<PlacementDecision | null> {
    if (policy) {
        const decision = policyRule(policy, ctx, roster, nowEpochMs);
        if (decision) return decision;
    }
    return claimRule(ctx, roster) ?? (await weightedFallback(crypto, ctx, roster));
}
