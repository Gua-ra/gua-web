/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useState } from "react";

import { _t } from "../../../languageHandler";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import IdentityServiceClient from "../../../identity/IdentityServiceClient";
import { translateIdentityError } from "../../../identity/identityErrors";
import { type PhoneNumberCountryDefinition } from "../../../phonenumber";
import AccessibleButton from "../elements/AccessibleButton";
import Field from "../elements/Field";
import Spinner from "../elements/Spinner";
import CountryDropdown from "../auth/CountryDropdown";
import GuaPinBubbleField from "../elements/GuaPinBubbleField";
import GuaPinSetup from "../../structures/auth/GuaPinSetup";
import { ErrorMessage } from "../../structures/ErrorMessage";

const PIN_LENGTH = 6;
const OTP_LENGTH = 6;

type Mode = "loading" | "status" | "setPin" | "changeStart" | "changeConfirm";

/**
 * Two-step verification (PIN) management for the Security settings tab. Reads PIN status from
 * the identity-service and lets the user set an initial PIN or change an existing one (via an
 * OTP-protected challenge). Web equivalent of the iOS TwoStepVerificationScreen.
 */
export default function GuaTwoStepVerificationSettings(): JSX.Element | null {
    const cli = useMatrixClientContext();
    const client = useState(() => IdentityServiceClient.fromConfig())[0];

    const [mode, setMode] = useState<Mode>("loading");
    const [hasPin, setHasPin] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [success, setSuccess] = useState<string | undefined>(undefined);

    // Change-PIN working state.
    const [currentPin, setCurrentPin] = useState("");
    const [prefix, setPrefix] = useState("");
    const [iso2, setIso2] = useState<string | undefined>(undefined);
    const [digits, setDigits] = useState("");
    const [challengeId, setChallengeId] = useState("");
    const [otp, setOtp] = useState("");
    const [newPin, setNewPin] = useState("");

    const accessToken = cli.getAccessToken();

    useEffect(() => {
        if (!client || !accessToken) {
            setMode("status");
            return;
        }
        let cancelled = false;
        client
            .pinStatus(accessToken)
            .then((value) => {
                if (cancelled) return;
                setHasPin(value);
                setMode("status");
            })
            .catch((e) => {
                if (cancelled) return;
                setError(translateIdentityError(e));
                setMode("status");
            });
        return () => {
            cancelled = true;
        };
    }, [client, accessToken]);

    if (!client) return null;

    const resetChangeState = (): void => {
        setCurrentPin("");
        setDigits("");
        setChallengeId("");
        setOtp("");
        setNewPin("");
    };

    const handleSetPin = async (pin: string): Promise<void> => {
        if (!accessToken) return;
        setBusy(true);
        setError(undefined);
        try {
            await client.setInitialPin(accessToken, cli.getSafeUserId(), pin);
            setHasPin(true);
            setSuccess(_t("gua|two_step|set_success"));
            setMode("status");
        } catch (e) {
            setError(translateIdentityError(e));
        } finally {
            setBusy(false);
        }
    };

    const handleStartChange = async (): Promise<void> => {
        if (!accessToken || currentPin.length !== PIN_LENGTH || digits.length < 4) return;
        setBusy(true);
        setError(undefined);
        try {
            const id = await client.startPinChange(accessToken, `+${prefix}${digits}`, currentPin);
            setChallengeId(id);
            setOtp("");
            setNewPin("");
            setMode("changeConfirm");
        } catch (e) {
            setError(translateIdentityError(e));
        } finally {
            setBusy(false);
        }
    };

    const handleCompleteChange = async (): Promise<void> => {
        if (!accessToken || otp.length !== OTP_LENGTH || newPin.length !== PIN_LENGTH) return;
        setBusy(true);
        setError(undefined);
        try {
            await client.completePinChange(accessToken, challengeId, otp, newPin);
            setSuccess(_t("gua|two_step|change_success"));
            resetChangeState();
            setMode("status");
        } catch (e) {
            setError(translateIdentityError(e));
        } finally {
            setBusy(false);
        }
    };

    const onCountryChange = (country: PhoneNumberCountryDefinition): void => {
        setIso2(country.iso2);
        setPrefix(country.prefix);
    };

    if (mode === "loading") return <Spinner />;

    return (
        <div className="mx_GuaTwoStepVerificationSettings">
            {error ? <ErrorMessage message={error} /> : null}
            {success && mode === "status" ? <p className="mx_AuthBody_text">{success}</p> : null}

            {mode === "status" && (
                <>
                    <p>{hasPin ? _t("gua|two_step|status_on") : _t("gua|two_step|status_off")}</p>
                    <AccessibleButton
                        kind="primary"
                        onClick={() => {
                            setError(undefined);
                            setSuccess(undefined);
                            if (hasPin) {
                                resetChangeState();
                                setMode("changeStart");
                            } else {
                                setMode("setPin");
                            }
                        }}
                    >
                        {hasPin ? _t("gua|two_step|change_pin") : _t("gua|two_step|set_up")}
                    </AccessibleButton>
                </>
            )}

            {mode === "setPin" && (
                <GuaPinSetup
                    busy={busy}
                    errorMessage={error}
                    allowSkip
                    onSkip={() => setMode("status")}
                    onComplete={handleSetPin}
                />
            )}

            {mode === "changeStart" && (
                <form
                    onSubmit={(ev) => {
                        ev.preventDefault();
                        void handleStartChange();
                    }}
                >
                    <p className="mx_AuthBody_text">{_t("gua|two_step|current_pin")}</p>
                    <GuaPinBubbleField
                        value={currentPin}
                        disabled={busy}
                        autoFocus
                        ariaLabel={_t("gua|two_step|current_pin")}
                        onChange={setCurrentPin}
                    />
                    <Field
                        element="input"
                        type="tel"
                        label={_t("gua|two_step|phone_label")}
                        value={digits}
                        disabled={busy}
                        onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                            setDigits(ev.target.value.replace(/\D/g, ""))
                        }
                        prefixComponent={
                            <CountryDropdown
                                value={iso2}
                                onOptionChange={onCountryChange}
                                isSmall
                                showPrefix
                                disabled={busy}
                            />
                        }
                    />
                    <input
                        className="mx_Login_submit"
                        type="submit"
                        value={_t("gua|two_step|send_code")}
                        disabled={busy || currentPin.length !== PIN_LENGTH || digits.length < 4}
                    />
                    <div className="mx_AuthBody_changeFlow">
                        <AccessibleButton kind="link_inline" disabled={busy} onClick={() => setMode("status")}>
                            {_t("gua|two_step|cancel")}
                        </AccessibleButton>
                    </div>
                </form>
            )}

            {mode === "changeConfirm" && (
                <form
                    onSubmit={(ev) => {
                        ev.preventDefault();
                        void handleCompleteChange();
                    }}
                >
                    <Field
                        element="input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        label={_t("gua|two_step|otp_label")}
                        value={otp}
                        autoFocus
                        disabled={busy}
                        onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                            setOtp(ev.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
                        }
                    />
                    <p className="mx_AuthBody_text">{_t("gua|two_step|new_pin")}</p>
                    <GuaPinBubbleField
                        value={newPin}
                        disabled={busy}
                        ariaLabel={_t("gua|two_step|new_pin")}
                        onChange={setNewPin}
                    />
                    <input
                        className="mx_Login_submit"
                        type="submit"
                        value={_t("gua|two_step|done")}
                        disabled={busy || otp.length !== OTP_LENGTH || newPin.length !== PIN_LENGTH}
                    />
                    <div className="mx_AuthBody_changeFlow">
                        <AccessibleButton kind="link_inline" disabled={busy} onClick={() => setMode("status")}>
                            {_t("gua|two_step|cancel")}
                        </AccessibleButton>
                    </div>
                </form>
            )}
        </div>
    );
}
