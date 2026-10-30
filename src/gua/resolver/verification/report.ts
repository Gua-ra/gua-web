/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export enum Reason {
    NoTrustRoots = "no_trust_roots",
    CryptoUnsupported = "crypto_unsupported",
    RosterUnavailable = "roster_unavailable",
    ParseError = "parse_error",
    MixedRosterForm = "mixed_roster_form",
    Timeout = "timeout",
    InternalError = "internal_error",
    RosterUnverified = "roster_unverified",
    UnknownKeyId = "unknown_key_id",
    BadSignature = "bad_signature",
    ThresholdNotMet = "threshold_not_met",
    UnsupportedSchema = "unsupported_schema",
    UnsupportedAlg = "unsupported_alg",
    BadKeyId = "bad_key_id",
    BadSequence = "bad_sequence",
    BadWindow = "bad_window",
    OutsideWindow = "outside_window",
    MalformedSignature = "malformed_signature",
    NoCanonicalEncoding = "no_canonical_encoding",
    BadSigningKey = "bad_signing_key",
    MissingSignature = "missing_signature",
    NoMatchingEntry = "no_matching_entry",
    LogUnavailable = "log_unavailable",
    StorageUnavailable = "storage_unavailable",
    NoPolicyKeys = "no_policy_keys",
    PolicyUnavailable = "policy_unavailable",
    PolicyNotServed = "policy_not_served",
    LogMismatch = "log_mismatch",
    PolicyNotLogged = "policy_not_logged",
    PolicyNewerThanCheckpoint = "policy_newer_than_checkpoint",
    PolicySuperseded = "policy_superseded",
    LogTooLarge = "log_too_large",
    PolicyUnverified = "policy_unverified",
    ExistingAccount = "existing_account",
    UnsignedRule = "unsigned_rule",
    Unattributed = "unattributed",
}

export type Environment = "dev" | "prod" | "unknown";

export type RosterForm = "v1" | "legacy" | "mixed";

export type HomeserverMatch = "ACTIVE_MATCH" | "INACTIVE" | "FIELD_MISMATCH" | "NOT_IN_ROSTER";

export type CheckName =
    | "rosterSignature"
    | "homeserverMatch"
    | "memberEntry"
    | "logConsistency"
    | "policy"
    | "placement";

export const CHECK_ORDER: readonly CheckName[] = [
    "rosterSignature",
    "homeserverMatch",
    "memberEntry",
    "logConsistency",
    "policy",
    "placement",
];

export type CheckResult =
    | { outcome: "invalid" | "unverifiable" | "indeterminate"; reason: Reason }
    | {
          outcome:
              | "valid"
              | HomeserverMatch
              | "unattested"
              | "firstSeen"
              | "consistent"
              | "rollback"
              | "inconsistent"
              | "notPresent"
              | "match"
              | "mismatch";
      };

export type OverallOutcome = { outcome: "verified" } | { outcome: "failed" | "unverifiable"; check: CheckName };

export type ResolverVerificationReport = Record<CheckName, CheckResult> & {
    environment: Environment;
    rosterVersion: number | null;
    rosterForm: RosterForm | null;
    overall: OverallOutcome;
    durationMs: number;
};

const FAILING = new Set([
    "invalid",
    "INACTIVE",
    "FIELD_MISMATCH",
    "NOT_IN_ROSTER",
    "rollback",
    "inconsistent",
    "mismatch",
]);
const OPEN = new Set(["unverifiable", "indeterminate"]);

export function invalid(reason: Reason): CheckResult {
    return { outcome: "invalid", reason };
}

export function unverifiable(reason: Reason): CheckResult {
    return { outcome: "unverifiable", reason };
}

export function indeterminate(reason: Reason): CheckResult {
    return { outcome: "indeterminate", reason };
}

export function overallOutcome(checks: Record<CheckName, CheckResult>): OverallOutcome {
    const failed = CHECK_ORDER.find((name) => FAILING.has(checks[name].outcome));
    if (failed) return { outcome: "failed", check: failed };
    const open = CHECK_ORDER.find((name) => OPEN.has(checks[name].outcome));
    return open ? { outcome: "unverifiable", check: open } : { outcome: "verified" };
}

export function formatOutcome(result: CheckResult | OverallOutcome): string {
    if ("reason" in result) return `${result.outcome}(${result.reason})`;
    if ("check" in result) return `${result.outcome}(${result.check})`;
    return result.outcome;
}

/** Codes and labels only: never a phone, URL or server name. */
export function formatReport(report: ResolverVerificationReport): string {
    const fields = [
        `environment=${report.environment}`,
        `rosterVersion=${report.rosterVersion ?? "none"}`,
        `rosterForm=${report.rosterForm ?? "none"}`,
        ...CHECK_ORDER.map((name) => `${name}=${formatOutcome(report[name])}`),
        `overall=${formatOutcome(report.overall)}`,
        `durationMs=${report.durationMs}`,
    ];
    return `Resolver verification ${fields.join(" ")}`;
}
