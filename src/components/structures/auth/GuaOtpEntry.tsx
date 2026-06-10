/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type SyntheticEvent, useEffect, useState } from "react";

import { _t } from "../../../languageHandler";
import Field from "../../views/elements/Field";
import AccessibleButton from "../../views/elements/AccessibleButton";
import { ErrorMessage } from "../ErrorMessage";

const CODE_LENGTH = 6;

interface Props {
    phoneNumber: string;
    busy: boolean;
    errorMessage?: string;
    /** Bumped by the coordinator after a resend to restart the countdown and clear the field. */
    resendNonce: number;
    initialResendCountdown?: number;
    onVerify: (code: string) => void;
    onResend: () => void;
    onChangePhone: () => void;
}

/**
 * Second step of the Gua onboarding flow: a 6-digit OTP field that auto-submits when full,
 * with a resend countdown and a "change phone number" affordance. Web equivalent of the iOS
 * OtpEntryScreen.
 */
export default function GuaOtpEntry({
    phoneNumber,
    busy,
    errorMessage,
    resendNonce,
    initialResendCountdown = 30,
    onVerify,
    onResend,
    onChangePhone,
}: Props): JSX.Element {
    const [code, setCode] = useState("");
    const [secondsLeft, setSecondsLeft] = useState(initialResendCountdown);

    // Restart the countdown and clear the field whenever a resend is issued.
    useEffect(() => {
        setSecondsLeft(initialResendCountdown);
        setCode("");
    }, [resendNonce, initialResendCountdown]);

    useEffect(() => {
        if (secondsLeft <= 0) return;
        const id = window.setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
        return () => window.clearTimeout(id);
    }, [secondsLeft]);

    const canVerify = !busy && code.length === CODE_LENGTH;
    const canResend = !busy && secondsLeft === 0;

    const onCodeChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
        const cleaned = ev.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
        setCode(cleaned);
        if (cleaned.length === CODE_LENGTH && !busy) {
            onVerify(cleaned);
        }
    };

    const submit = (ev?: SyntheticEvent): void => {
        ev?.preventDefault();
        if (canVerify) onVerify(code);
    };

    return (
        <form onSubmit={submit}>
            <p className="mx_AuthBody_text">{_t("gua|otp|subtitle", { phone: phoneNumber })}</p>
            <Field
                element="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                label={_t("gua|otp|code_label")}
                value={code}
                autoFocus
                disabled={busy}
                onChange={onCodeChange}
            />
            {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
            <input className="mx_Login_submit" type="submit" value={_t("gua|otp|verify")} disabled={!canVerify} />
            <div className="mx_AuthBody_changeFlow">
                <AccessibleButton kind="link_inline" disabled={!canResend} onClick={onResend}>
                    {secondsLeft > 0 ? _t("gua|otp|resend_in", { seconds: secondsLeft }) : _t("gua|otp|resend")}
                </AccessibleButton>
            </div>
            <div className="mx_AuthBody_changeFlow">
                <AccessibleButton kind="link_inline" disabled={busy} onClick={onChangePhone}>
                    {_t("gua|otp|change_phone")}
                </AccessibleButton>
            </div>
        </form>
    );
}
