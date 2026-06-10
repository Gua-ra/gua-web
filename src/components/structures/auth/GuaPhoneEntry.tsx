/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type SyntheticEvent, useState } from "react";

import { _t } from "../../../languageHandler";
import { type PhoneNumberCountryDefinition } from "../../../phonenumber";
import Field from "../../views/elements/Field";
import CountryDropdown from "../../views/auth/CountryDropdown";
import { ErrorMessage } from "../ErrorMessage";

interface Props {
    busy: boolean;
    errorMessage?: string;
    onSubmit: (e164PhoneNumber: string) => void;
}

const cleanDigits = (value: string): string => value.replace(/\D/g, "");

/**
 * First step of the Gua onboarding flow: country picker (emoji flag + dial code) plus a
 * national phone-number field. Composes an E.164 number and hands it to the coordinator.
 * Web equivalent of the iOS PhoneEntryScreen.
 */
export default function GuaPhoneEntry({ busy, errorMessage, onSubmit }: Props): JSX.Element {
    const [iso2, setIso2] = useState<string | undefined>(undefined);
    const [prefix, setPrefix] = useState("");
    const [digits, setDigits] = useState("");

    // E.164 numbers are 1–15 digits including the country code; require at least a 4-digit
    // subscriber number and cap the total length (mirrors the iOS validation).
    const totalDigits = prefix.length + digits.length;
    const canContinue = !busy && digits.length >= 4 && totalDigits <= 15;

    const submit = (ev?: SyntheticEvent): void => {
        ev?.preventDefault();
        if (!canContinue) return;
        onSubmit(`+${prefix}${digits}`);
    };

    const onCountryChange = (country: PhoneNumberCountryDefinition): void => {
        setIso2(country.iso2);
        setPrefix(country.prefix);
    };

    return (
        <form onSubmit={submit}>
            <p className="mx_AuthBody_text">{_t("gua|phone|subtitle")}</p>
            <Field
                element="input"
                type="tel"
                label={_t("gua|phone|number_label")}
                value={digits}
                autoFocus
                disabled={busy}
                onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setDigits(cleanDigits(ev.target.value))}
                prefixComponent={
                    <CountryDropdown value={iso2} onOptionChange={onCountryChange} isSmall showPrefix disabled={busy} />
                }
            />
            {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
            <input className="mx_Login_submit" type="submit" value={_t("action|continue")} disabled={!canContinue} />
        </form>
    );
}
