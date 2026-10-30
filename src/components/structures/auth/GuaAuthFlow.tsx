/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useMemo, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import { _t, getUserLanguage } from "../../../languageHandler";
import { type IMatrixClientCreds } from "../../../MatrixClientPeg";
import SdkConfig from "../../../SdkConfig";
import { type ValidatedServerConfig } from "../../../utils/ValidatedServerConfig";
import { getOidcClientId } from "../../../utils/oidc/registerClient";
import { startGuaPhoneOidcLogin } from "../../../gua/oidc/startPhoneOidcLogin";
import AutoDiscoveryUtils from "../../../utils/AutoDiscoveryUtils";
import ResolverClient from "../../../gua/resolver/ResolverClient";
import { ResolverVerification } from "../../../gua/resolver/verification/ResolverVerifier";
import AuthPage from "../../views/auth/AuthPage";
import AuthBody from "../../views/auth/AuthBody";
import AuthHeader from "../../views/auth/AuthHeader";
import InlineSpinner from "../../views/elements/InlineSpinner";
import IdentityServiceClient, { type IdentityServiceVerifyOutcome } from "../../../identity/IdentityServiceClient";
import { credsFromIdentitySession, currentDeviceInfo } from "../../../identity/identitySession";
import { translateIdentityError } from "../../../identity/identityErrors";
import { ErrorMessage } from "../ErrorMessage";
import GuaPhoneEntry from "./GuaPhoneEntry";
import GuaOtpEntry from "./GuaOtpEntry";
import GuaProfileSetup from "./GuaProfileSetup";
import GuaPinChallenge from "./GuaPinChallenge";

interface Props {
    onLoggedIn: (creds: IMatrixClientCreds) => void;
    serverConfig: ValidatedServerConfig;
}

const VERIFICATION_REFRESH_MS = 60_000;

type Step =
    | { kind: "phone" }
    | { kind: "otp"; phone: string }
    | { kind: "newUser"; phone: string; signupToken: string }
    | { kind: "pinRequired"; phone: string; challengeToken: string }
    | { kind: "finishing" };

/**
 * GUA: ask the resolver which homeserver a phone belongs to (or should be created on) and discover its
 * full config. Falls back to the configured default server config when the resolver is unset or the lookup
 * fails, so the app keeps working before the resolver is deployed. Mirrors the iOS `resolveHomeserver`.
 */
async function resolveServerConfig(
    e164: string,
    fallback: ValidatedServerConfig,
    verification: ResolverVerification | null,
): Promise<ValidatedServerConfig> {
    const resolver = ResolverClient.fromConfig();
    if (!resolver) return fallback;
    try {
        const resolution = await resolver.resolve(e164);
        void verification?.verify(resolution, e164);
        // Use the homeserver base URL the resolver returned directly (it is the source of truth), rather
        // than re-discovering via HTTPS well-known on the server name — that is redundant and fails for
        // http/localhost homeservers. The homeserver's own auth metadata still yields the MAS config.
        return await AutoDiscoveryUtils.validateServerConfigWithStaticUrls(resolution.homeserver.baseUrl);
    } catch (e) {
        logger.warn("Gua resolver lookup failed; falling back to the default server config", e);
        return fallback;
    }
}

/**
 * Coordinator for the Gua phone/OTP onboarding flow. Drives the identity-service REST API
 * and hands the minted Matrix session up via `onLoggedIn`, exactly like element-web's
 * password login. Web equivalent of the iOS AuthenticationFlowCoordinator.
 *
 * The `newUser` (profile setup) and `pinRequired` (two-step sign-in) branches are wired in by
 * subsequent steps of the flow.
 */
export default function GuaAuthFlow({ onLoggedIn, serverConfig }: Props): JSX.Element {
    const client = useMemo(() => IdentityServiceClient.fromConfig(), []);
    const verification = useMemo(() => ResolverVerification.fromConfig(), []);
    const hasDelegatedOidc = !!serverConfig.delegatedAuthentication;
    const [step, setStep] = useState<Step>({ kind: "phone" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [resendNonce, setResendNonce] = useState(0);
    const [pinResetNonce, setPinResetNonce] = useState(0);

    // GUA: verify the resolver's roster, log and policy while the phone step is shown, and keep them fresh, so the
    // redirect that follows the answer does not cut the checks off.
    const showsPhoneEntry = (!!client || hasDelegatedOidc) && step.kind === "phone";
    useEffect(() => {
        if (!showsPhoneEntry || !verification) return;
        verification.prepare();
        const refresh = setInterval(() => verification.prepare(), VERIFICATION_REFRESH_MS);
        return () => clearInterval(refresh);
    }, [verification, showsPhoneEntry]);

    const applyOutcome = (outcome: IdentityServiceVerifyOutcome, phone: string): void => {
        switch (outcome.kind) {
            case "existingUser":
                setStep({ kind: "finishing" });
                onLoggedIn(credsFromIdentitySession(outcome.session));
                break;
            case "newUser":
                setBusy(false);
                setStep({ kind: "newUser", phone, signupToken: outcome.signupToken });
                break;
            case "pinRequired":
                setBusy(false);
                setStep({ kind: "pinRequired", phone, challengeToken: outcome.challengeToken });
                break;
        }
    };

    const handlePhoneSubmit = async (e164: string): Promise<void> => {
        setBusy(true);
        setError(undefined);
        try {
            // GUA: route to the homeserver this phone belongs to, instead of always the configured default.
            const effectiveConfig = await resolveServerConfig(e164, serverConfig, verification);
            if (effectiveConfig.delegatedAuthentication) {
                const clientId = await getOidcClientId(
                    effectiveConfig.delegatedAuthentication,
                    SdkConfig.get().oidc_static_clients,
                );
                // Leaving the page drops any verification still running, so its report is logged now.
                verification?.flush();
                await startGuaPhoneOidcLogin(
                    effectiveConfig.delegatedAuthentication,
                    clientId,
                    effectiveConfig.hsUrl,
                    effectiveConfig.isUrl,
                    e164,
                );
                return;
            }

            if (!client) return;
            await client.sendOTP(e164, getUserLanguage());
            setStep({ kind: "otp", phone: e164 });
        } catch (e) {
            setError(translateIdentityError(e));
        } finally {
            setBusy(false);
        }
    };

    const handleVerify = async (code: string): Promise<void> => {
        if (!client || step.kind !== "otp") return;
        const { phone } = step;
        setBusy(true);
        setError(undefined);
        try {
            const outcome = await client.verifyOTP(phone, code, undefined, currentDeviceInfo());
            applyOutcome(outcome, phone);
        } catch (e) {
            setError(translateIdentityError(e));
            setBusy(false);
        }
    };

    const handleResend = async (): Promise<void> => {
        if (!client || step.kind !== "otp") return;
        setBusy(true);
        setError(undefined);
        try {
            await client.sendOTP(step.phone, getUserLanguage());
            setResendNonce((n) => n + 1);
        } catch (e) {
            setError(translateIdentityError(e));
        } finally {
            setBusy(false);
        }
    };

    const handleChangePhone = (): void => {
        setError(undefined);
        setStep({ kind: "phone" });
    };

    const handleProfileSubmit = async (username: string, displayName: string): Promise<void> => {
        if (!client || step.kind !== "newUser") return;
        setBusy(true);
        setError(undefined);
        try {
            const session = await client.completeSignup(
                step.signupToken,
                username,
                displayName,
                undefined,
                currentDeviceInfo(),
            );
            setStep({ kind: "finishing" });
            onLoggedIn(credsFromIdentitySession(session));
        } catch (e) {
            setError(translateIdentityError(e));
            setBusy(false);
        }
    };

    const handlePinVerify = async (pin: string): Promise<void> => {
        if (!client || step.kind !== "pinRequired") return;
        setBusy(true);
        setError(undefined);
        try {
            const session = await client.verifyPinChallenge(step.challengeToken, pin, currentDeviceInfo());
            setStep({ kind: "finishing" });
            onLoggedIn(credsFromIdentitySession(session));
        } catch (e) {
            setError(translateIdentityError(e));
            setBusy(false);
            setPinResetNonce((n) => n + 1);
        }
    };

    let title: string;
    let body: React.ReactNode;
    if (!client && !hasDelegatedOidc) {
        title = _t("action|sign_in");
        body = <ErrorMessage message={_t("gua|errors|not_configured")} />;
    } else {
        switch (step.kind) {
            case "phone":
                title = _t("gua|phone|title");
                body = <GuaPhoneEntry busy={busy} errorMessage={error} onSubmit={handlePhoneSubmit} />;
                break;
            case "otp":
                title = _t("gua|otp|title");
                body = (
                    <GuaOtpEntry
                        phoneNumber={step.phone}
                        busy={busy}
                        errorMessage={error}
                        resendNonce={resendNonce}
                        onVerify={handleVerify}
                        onResend={handleResend}
                        onChangePhone={handleChangePhone}
                    />
                );
                break;
            case "newUser":
                title = _t("gua|profile|title");
                if (!client) {
                    body = <ErrorMessage message={_t("gua|errors|not_configured")} />;
                    break;
                }
                body = (
                    <GuaProfileSetup
                        busy={busy}
                        errorMessage={error}
                        checkUsername={(u) => client.checkUsernameAvailability(u)}
                        onSubmit={handleProfileSubmit}
                    />
                );
                break;
            case "pinRequired":
                title = _t("gua|pin|challenge_title");
                body = (
                    <GuaPinChallenge
                        busy={busy}
                        errorMessage={error}
                        resetNonce={pinResetNonce}
                        onVerify={handlePinVerify}
                        onCancel={handleChangePhone}
                    />
                );
                break;
            default:
                title = _t("auth|signing_in");
                body = <InlineSpinner w={32} h={32} />;
                break;
        }
    }

    return (
        <AuthPage>
            <AuthHeader />
            <AuthBody>
                <h1>{title}</h1>
                {body}
            </AuthBody>
        </AuthPage>
    );
}
