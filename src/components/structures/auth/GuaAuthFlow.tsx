/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useMemo, useState } from "react";

import { _t, getUserLanguage } from "../../../languageHandler";
import { type IMatrixClientCreds } from "../../../MatrixClientPeg";
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

interface Props {
    onLoggedIn: (creds: IMatrixClientCreds) => void;
}

type Step =
    | { kind: "phone" }
    | { kind: "otp"; phone: string }
    | { kind: "newUser"; phone: string; signupToken: string }
    | { kind: "pinRequired"; phone: string; challengeToken: string }
    | { kind: "finishing" };

/**
 * Coordinator for the Gua phone/OTP onboarding flow. Drives the identity-service REST API
 * and hands the minted Matrix session up via `onLoggedIn`, exactly like element-web's
 * password login. Web equivalent of the iOS AuthenticationFlowCoordinator.
 *
 * The `newUser` (profile setup) and `pinRequired` (two-step sign-in) branches are wired in by
 * subsequent steps of the flow.
 */
export default function GuaAuthFlow({ onLoggedIn }: Props): JSX.Element {
    const client = useMemo(() => IdentityServiceClient.fromConfig(), []);
    const [step, setStep] = useState<Step>({ kind: "phone" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [resendNonce, setResendNonce] = useState(0);

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
        if (!client) return;
        setBusy(true);
        setError(undefined);
        try {
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

    let title: string;
    let body: React.ReactNode;
    if (!client) {
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
