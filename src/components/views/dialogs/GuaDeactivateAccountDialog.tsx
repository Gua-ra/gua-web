/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useState } from "react";

import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { _t } from "../../../languageHandler";
import IdentityServiceClient from "../../../identity/IdentityServiceClient";
import { translateIdentityError } from "../../../identity/identityErrors";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import AccessibleButton from "../elements/AccessibleButton";
import Field from "../elements/Field";
import StyledCheckbox from "../elements/StyledCheckbox";
import { ErrorMessage } from "../../structures/ErrorMessage";
import BaseDialog from "./BaseDialog";

const OTP_LENGTH = 6;

interface IProps {
    onFinished: (success?: boolean) => void;
}

type Step = "confirm" | "verify";

/**
 * Account deactivation gated by a fresh phone-OTP reauthentication via the identity-service
 * (startAccountReauth → verifyAccountReauth → deactivateAccount), then a local logout. Web
 * equivalent of the iOS reauth-gated DeactivateAccountScreen.
 */
export default function GuaDeactivateAccountDialog({ onFinished }: IProps): JSX.Element {
    const client = useState(() => IdentityServiceClient.fromConfig())[0];
    const [step, setStep] = useState<Step>("confirm");
    const [erase, setErase] = useState(false);
    const [otp, setOtp] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const accessToken = MatrixClientPeg.safeGet().getAccessToken();

    const handleSendCode = async (): Promise<void> => {
        if (!client || !accessToken) return;
        setBusy(true);
        setError(undefined);
        try {
            await client.startAccountReauth(accessToken);
            setStep("verify");
        } catch (e) {
            setError(translateIdentityError(e));
        } finally {
            setBusy(false);
        }
    };

    const handleDeactivate = async (): Promise<void> => {
        if (!client || !accessToken || otp.length !== OTP_LENGTH) return;
        setBusy(true);
        setError(undefined);
        try {
            const reauthToken = await client.verifyAccountReauth(accessToken, otp);
            await client.deactivateAccount(accessToken, reauthToken, erase);
            // Deactivation worked - logout & close this dialog.
            defaultDispatcher.fire(Action.TriggerLogout);
            onFinished(true);
        } catch (e) {
            setError(translateIdentityError(e));
            setBusy(false);
        }
    };

    return (
        <BaseDialog
            className="mx_DeactivateAccountDialog"
            onFinished={onFinished}
            titleClass="danger"
            title={_t("settings|general|deactivate_section")}
            screenName="DeactivateAccount"
        >
            <div className="mx_Dialog_content">
                {error ? <ErrorMessage message={error} /> : null}

                {step === "confirm" ? (
                    <>
                        <p>{_t("gua|deactivate|intro")}</p>
                        <StyledCheckbox checked={erase} onChange={(e) => setErase(e.target.checked)} disabled={busy}>
                            {_t("gua|deactivate|erase")}
                        </StyledCheckbox>
                        <div className="mx_Dialog_buttons">
                            <AccessibleButton kind="primary_outline" disabled={busy} onClick={() => onFinished(false)}>
                                {_t("gua|deactivate|cancel")}
                            </AccessibleButton>
                            <AccessibleButton kind="danger" disabled={busy} onClick={handleSendCode}>
                                {_t("gua|deactivate|send_code")}
                            </AccessibleButton>
                        </div>
                    </>
                ) : (
                    <>
                        <Field
                            element="input"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            label={_t("gua|deactivate|otp_label")}
                            value={otp}
                            autoFocus
                            disabled={busy}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                                setOtp(ev.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
                            }
                        />
                        <div className="mx_Dialog_buttons">
                            <AccessibleButton kind="primary_outline" disabled={busy} onClick={() => onFinished(false)}>
                                {_t("gua|deactivate|cancel")}
                            </AccessibleButton>
                            <AccessibleButton
                                kind="danger"
                                disabled={busy || otp.length !== OTP_LENGTH}
                                onClick={handleDeactivate}
                            >
                                {_t("gua|deactivate|confirm")}
                            </AccessibleButton>
                        </div>
                    </>
                )}
            </div>
        </BaseDialog>
    );
}
