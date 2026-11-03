/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    activeEntries,
    compareUtf16,
    nz,
    type RosterClaim,
    type RosterHomeserver,
    type SignedRoster,
} from "./canonical";
import { utf8Bytes, type VerifierCrypto } from "./ed25519";
import {
    type DelegationZone,
    inEffect,
    isRuleEnabled,
    type RoutingPolicyBundle,
    type RoutingPolicyRule,
    sortedRules,
} from "./policy";

/** Affiliations and attributes count only in a verified claims envelope, which a public client never has. */
export interface PlacementContext {
    phone: string | null;
    country: string | null;
    mccmnc: string | null;
    carrier: string | null;
    regionHint: string | null;
}

export interface PlacementDecision {
    homeserver: RosterHomeserver;
    rule: "PolicyRoutingRule" | "ClaimRule" | "WeightedFallbackRule";
    ruleId: string;
}

export interface Placement {
    decision: PlacementDecision | null;
    unsignedRuleAbove: boolean;
}

export interface VerifiedPolicy {
    bundle: RoutingPolicyBundle;
    delegateVerifiedZones: Set<string>;
}

export function phoneContext(phone: string): PlacementContext {
    return { phone, country: null, mccmnc: null, carrier: null, regionHint: null };
}

export function routingKey(ctx: PlacementContext): string {
    let key = `phone=${nz(ctx.phone)}\n`;
    key += `country=${nz(ctx.country)}\n`;
    key += `mccmnc=${nz(ctx.mccmnc)}\n`;
    key += `carrier=${nz(ctx.carrier)}\n`;
    key += `region=${nz(ctx.regionHint)}\n`;
    return key + "affiliations=\nattrs=";
}

export function placementCandidates(roster: SignedRoster): RosterHomeserver[] {
    return activeEntries(roster)
        .map((e) => e.homeserver)
        .filter((h) => h.acceptsNew)
        .sort((a, b) => compareUtf16(nz(a.id), nz(b.id)));
}

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

/** Institution and OIDC rules need signature-verified claims, which a public client never carries. */
function ruleMatches(rule: RoutingPolicyRule, ctx: PlacementContext): boolean {
    return (
        rule.matchType === "PHONE_PREFIX" &&
        rule.matchValue !== null &&
        ctx.phone !== null &&
        ctx.phone.startsWith(rule.matchValue)
    );
}

/** No bundle signature or POLICY_PUBLISH hash covers a delegate signature: a resolver can strip one to hide a rule. */
function policyRule(
    policy: VerifiedPolicy,
    ctx: PlacementContext,
    roster: SignedRoster,
    nowEpochMs: number,
): Placement {
    const targets = new Map(placementCandidates(roster).map((h) => [h.id, h]));
    const zones = new Map<string, DelegationZone>();
    for (const zone of policy.bundle.delegationZones) {
        if (zone.id !== null && !zones.has(zone.id)) zones.set(zone.id, zone);
    }
    const ranked = sortedRules(policy.bundle.rules).filter(isRuleEnabled);
    let unsignedRuleAbove = false;
    for (const rule of ranked) {
        const zone = rule.delegatedZoneId === null ? undefined : zones.get(rule.delegatedZoneId);
        if (!zone || !inEffect(zone.notBefore, zone.expiresAt, nowEpochMs) || !ruleMatches(rule, ctx)) continue;
        if (!policy.delegateVerifiedZones.has(zone.id!)) {
            unsignedRuleAbove = true;
            continue;
        }
        const target = targets.get(rule.targetHomeserverId);
        if (target) {
            return {
                decision: { homeserver: target, rule: "PolicyRoutingRule", ruleId: nz(rule.id) },
                unsignedRuleAbove,
            };
        }
    }
    return { decision: null, unsignedRuleAbove };
}

function claimRule(ctx: PlacementContext, roster: SignedRoster): PlacementDecision | null {
    let best: { homeserver: RosterHomeserver; priority: number } | null = null;
    for (const entry of activeEntries(roster)) {
        if (!entry.homeserver.acceptsNew) continue;
        for (const claim of entry.claims) {
            if (isRemote(claim) || !claimMatches(claim, ctx)) continue;
            const candidate = { homeserver: entry.homeserver, priority: claim.priority };
            if (
                best === null ||
                candidate.priority - best.priority < 0 ||
                (candidate.priority === best.priority &&
                    compareUtf16(nz(candidate.homeserver.id), nz(best.homeserver.id)) < 0)
            ) {
                best = candidate;
            }
        }
    }
    if (!best) return null;
    return {
        homeserver: best.homeserver,
        rule: "ClaimRule",
        ruleId: `roster-claim:${best.homeserver.id}:${best.priority}`,
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
    // Weights are int32, so this sum is exact in a double, as Java's 64-bit sum is: it never wraps.
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
    return { homeserver: chosen, rule: "WeightedFallbackRule", ruleId: "weighted-fallback" };
}

export async function reproducePlacement(
    crypto: VerifierCrypto,
    ctx: PlacementContext,
    roster: SignedRoster,
    policy: VerifiedPolicy | null,
    nowEpochMs: number,
): Promise<Placement> {
    const byPolicy = policy
        ? policyRule(policy, ctx, roster, nowEpochMs)
        : { decision: null, unsignedRuleAbove: false };
    if (byPolicy.decision) return byPolicy;
    const decision = claimRule(ctx, roster) ?? (await weightedFallback(crypto, ctx, roster));
    return { decision, unsignedRuleAbove: byPolicy.unsignedRuleAbove };
}
