/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { _t } from "../languageHandler";
import { IdentityServiceError } from "./IdentityServiceClient";

/**
 * Map an error thrown by {@link IdentityServiceClient} to a localised, user-facing message.
 * Mirrors the iOS `IdentityServiceError.errorDescription` table.
 */
export function translateIdentityError(error: unknown): string {
    if (error instanceof IdentityServiceError) {
        switch (error.code) {
            case "notConfigured":
                return _t("gua|errors|not_configured");
            case "rateLimited":
                return _t("gua|errors|rate_limited");
            case "invalidOTP":
                return _t("gua|errors|invalid_otp");
            case "invalidPin":
                return _t("gua|errors|invalid_pin");
            case "pinLocked":
                return _t("gua|errors|pin_locked");
            case "pinChangeCooldown":
                return _t("gua|errors|pin_change_cooldown");
            case "pinChangeChallengeInvalid":
            case "pinChallengeExpired":
                return _t("gua|errors|pin_challenge_expired");
            case "invalidSignupToken":
                return _t("gua|errors|invalid_signup_token");
            case "usernameTaken":
                return _t("gua|errors|username_taken");
            case "phoneAlreadyLinked":
                return _t("gua|errors|phone_already_linked");
            case "invalidReauthToken":
                return _t("gua|errors|invalid_reauth_token");
            case "invalidUsername":
            case "server":
            case "transport":
            case "decoding":
            default:
                return error.message || _t("gua|errors|generic");
        }
    }
    return _t("gua|errors|generic");
}
