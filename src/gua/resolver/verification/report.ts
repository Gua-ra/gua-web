/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/** Fixed reason codes. A report never carries free text or identifiers from the server. */
export type Reason =
    | "bad_signature"
    | "threshold_not_met"
    | "unknown_key_id"
    | "no_trust_roots"
    | "no_policy_keys"
    | "roster_unavailable"
    | "roster_unverified"
    | "mixed_roster_form"
    | "crypto_unsupported"
    | "log_unavailable"
    | "log_mismatch"
    | "policy_unavailable"
    | "policy_not_logged"
    | "policy_unverified"
    | "parse_error"
    | "unsupported_schema"
    | "unsupported_alg"
    | "bad_key_id"
    | "bad_sequence"
    | "bad_window"
    | "malformed_signature"
    | "no_canonical_encoding"
    | "bad_signing_key"
    | "no_own_signature"
    | "rotation_not_signed"
    | "internal_error";

export type RosterForm = "v1" | "legacy" | "mixed";

export type HomeserverMatch = "ACTIVE_MATCH" | "INACTIVE" | "FIELD_MISMATCH" | "NOT_IN_ROSTER";

export interface CheckResult<O extends string> {
    outcome: O;
    reason?: Reason;
}

export type RosterSignatureCheck = CheckResult<"valid" | "invalid" | "unverifiable">;
export type HomeserverMatchCheck = CheckResult<HomeserverMatch | "unverifiable">;
export type MemberEntryCheck = CheckResult<"valid" | "unattested" | "invalid" | "unverifiable">;
export type LogConsistencyCheck = CheckResult<
    "consistent" | "firstSeen" | "rollback" | "inconsistent" | "unverifiable"
>;
export type PolicyCheck = CheckResult<"notPresent" | "valid" | "invalid" | "unverifiable">;
export type PlacementCheck = CheckResult<"match" | "mismatch" | "indeterminate" | "notApplicable" | "unverifiable">;

export type CheckName =
    | "rosterSignature"
    | "homeserverMatch"
    | "memberEntry"
    | "logConsistency"
    | "policy"
    | "placement";

export interface OverallOutcome {
    outcome: "verified" | "failed" | "unverifiable";
    check?: CheckName;
}

export interface ResolverVerificationReport {
    environment: string;
    rosterVersion: number | null;
    rosterForm: RosterForm | null;
    rosterSignature: RosterSignatureCheck;
    homeserverMatch: HomeserverMatchCheck;
    memberEntry: MemberEntryCheck;
    logConsistency: LogConsistencyCheck;
    policy: PolicyCheck;
    placement: PlacementCheck;
    overall: OverallOutcome;
    durationMs: number;
}

export type ReportChecks = Pick<ResolverVerificationReport, CheckName>;

const CHECK_ORDER: CheckName[] = [
    "rosterSignature",
    "homeserverMatch",
    "memberEntry",
    "logConsistency",
    "policy",
    "placement",
];

const FAILING = new Set([
    "invalid",
    "INACTIVE",
    "FIELD_MISMATCH",
    "NOT_IN_ROSTER",
    "rollback",
    "inconsistent",
    "mismatch",
]);
const PASSING = new Set([
    "valid",
    "ACTIVE_MATCH",
    "unattested",
    "consistent",
    "firstSeen",
    "notPresent",
    "match",
    "notApplicable",
]);

export function check<O extends string>(outcome: O, reason?: Reason): CheckResult<O> {
    return reason === undefined ? { outcome } : { outcome, reason };
}

export function overallOutcome(checks: ReportChecks): OverallOutcome {
    const failed = CHECK_ORDER.find((name) => FAILING.has(checks[name].outcome));
    if (failed) return { outcome: "failed", check: failed };
    const open = CHECK_ORDER.find((name) => !PASSING.has(checks[name].outcome));
    if (open) return { outcome: "unverifiable", check: open };
    return { outcome: "verified" };
}

/** Every check read as unverifiable for one reason, before any artifact was fetched. */
export function allUnverifiable(reason: Reason): ReportChecks {
    return {
        rosterSignature: check("unverifiable", reason),
        homeserverMatch: check("unverifiable", reason),
        memberEntry: check("unverifiable", reason),
        logConsistency: check("unverifiable", reason),
        policy: check("unverifiable", reason),
        placement: check("unverifiable", reason),
    };
}

function format(result: CheckResult<string> | OverallOutcome): string {
    const detail = "reason" in result ? result.reason : "check" in result ? result.check : undefined;
    return detail ? `${result.outcome}(${detail})` : result.outcome;
}

/** The report as flat log fields: outcome codes, version, form and environment label only. */
export function reportLogFields(report: ResolverVerificationReport): Record<string, string | number | null> {
    return {
        environment: report.environment,
        rosterVersion: report.rosterVersion,
        rosterForm: report.rosterForm,
        rosterSignature: format(report.rosterSignature),
        homeserverMatch: format(report.homeserverMatch),
        memberEntry: format(report.memberEntry),
        logConsistency: format(report.logConsistency),
        policy: format(report.policy),
        placement: format(report.placement),
        overall: format(report.overall),
        durationMs: report.durationMs,
    };
}
