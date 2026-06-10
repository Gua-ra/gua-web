/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type SyntheticEvent, useEffect, useState } from "react";

import { _t } from "../../../languageHandler";
import AccessibleButton from "../../views/elements/AccessibleButton";
import GuaPinBubbleField from "../../views/elements/GuaPinBubbleField";
import { ErrorMessage } from "../ErrorMessage";

const PIN_LENGTH = 6;

interface Props {
    busy: boolean;
    errorMessage?: string;
    /** Bumped by the coordinator on each failed attempt so the field clears for re-entry. */
    resetNonce: number;
    onVerify: (pin: string) => void;
    onForgotPin?: () => void;
    onCancel: () => void;
}

/**
 * Two-step sign-in step: enter the account PIN to complete a returning-user login. Auto-submits
 * once 6 digits are entered. Web equivalent of the iOS PinChallengeScreen.
 */
export default function GuaPinChallenge({
    busy,
    errorMessage,
    resetNonce,
    onVerify,
    onForgotPin,
    onCancel,
}: Props): JSX.Element {
    const [pin, setPin] = useState("");

    useEffect(() => {
        setPin("");
    }, [resetNonce]);

    const onPinChange = (next: string): void => {
        setPin(next);
        if (next.length === PIN_LENGTH && !busy) onVerify(next);
    };

    const submit = (ev?: SyntheticEvent): void => {
        ev?.preventDefault();
        if (!busy && pin.length === PIN_LENGTH) onVerify(pin);
    };

    return (
        <form onSubmit={submit}>
            <p className="mx_AuthBody_text">{_t("gua|pin|challenge_subtitle")}</p>
            <GuaPinBubbleField
                value={pin}
                hasError={Boolean(errorMessage)}
                disabled={busy}
                autoFocus
                ariaLabel={_t("gua|pin|label")}
                onChange={onPinChange}
            />
            {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
            <input
                className="mx_Login_submit"
                type="submit"
                value={_t("gua|pin|verify")}
                disabled={busy || pin.length !== PIN_LENGTH}
            />
            {onForgotPin ? (
                <div className="mx_AuthBody_changeFlow">
                    <AccessibleButton kind="link_inline" disabled={busy} onClick={onForgotPin}>
                        {_t("gua|pin|forgot")}
                    </AccessibleButton>
                </div>
            ) : null}
            <div className="mx_AuthBody_changeFlow">
                <AccessibleButton kind="link_inline" disabled={busy} onClick={onCancel}>
                    {_t("gua|otp|change_phone")}
                </AccessibleButton>
            </div>
        </form>
    );
}
