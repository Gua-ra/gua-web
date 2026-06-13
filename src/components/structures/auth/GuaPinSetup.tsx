/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useState } from "react";

import { _t } from "../../../languageHandler";
import AccessibleButton from "../../views/elements/AccessibleButton";
import GuaPinBubbleField from "../../views/elements/GuaPinBubbleField";
import { ErrorMessage } from "../ErrorMessage";

const PIN_LENGTH = 6;

type Step = "create" | "confirm";

interface Props {
    busy: boolean;
    errorMessage?: string;
    allowSkip?: boolean;
    onComplete: (pin: string) => void;
    onSkip?: () => void;
}

/**
 * Create + confirm a 6-digit account PIN. Auto-advances from create to confirm once 6 digits
 * are entered, and requires the confirmation to match. Web equivalent of the iOS PinSetupScreen.
 * Used post-login (two-step verification settings / PIN reminder).
 */
export default function GuaPinSetup({ busy, errorMessage, allowSkip, onComplete, onSkip }: Props): JSX.Element {
    const [step, setStep] = useState<Step>("create");
    const [initialPin, setInitialPin] = useState("");
    const [pin, setPin] = useState("");
    const [mismatch, setMismatch] = useState(false);

    const onPinChange = (next: string): void => {
        setPin(next);
        if (next.length !== PIN_LENGTH) return;

        if (step === "create") {
            setInitialPin(next);
            setPin("");
            setMismatch(false);
            setStep("confirm");
            return;
        }

        if (next === initialPin) {
            onComplete(next);
        } else {
            // Mismatch: restart from the create step.
            setMismatch(true);
            setInitialPin("");
            setPin("");
            setStep("create");
        }
    };

    const title = step === "create" ? _t("gua|pin|setup_create_title") : _t("gua|pin|setup_confirm_title");
    const subtitle = step === "create" ? _t("gua|pin|setup_create_subtitle") : _t("gua|pin|setup_confirm_subtitle");

    return (
        <div className="mx_GuaPinSetup">
            <h2>{title}</h2>
            <p className="mx_AuthBody_text">{subtitle}</p>
            <GuaPinBubbleField
                value={pin}
                hasError={mismatch || Boolean(errorMessage)}
                disabled={busy}
                autoFocus
                ariaLabel={_t("gua|pin|label")}
                onChange={onPinChange}
            />
            {mismatch ? <ErrorMessage message={_t("gua|pin|mismatch")} /> : null}
            {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
            {allowSkip && onSkip ? (
                <div className="mx_AuthBody_changeFlow">
                    <AccessibleButton kind="link_inline" disabled={busy} onClick={onSkip}>
                        {_t("gua|pin|skip")}
                    </AccessibleButton>
                </div>
            ) : null}
        </div>
    );
}
