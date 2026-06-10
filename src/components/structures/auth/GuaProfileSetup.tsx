/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type SyntheticEvent, useEffect, useState } from "react";

import { _t } from "../../../languageHandler";
import Field from "../../views/elements/Field";
import { ErrorMessage } from "../ErrorMessage";
import { type UsernameAvailability } from "../../../identity/IdentityServiceClient";

const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
const DISPLAY_NAME_MAX = 80;
const DISALLOWED_USERNAME_CHARS = /[^a-z0-9._-]/g;

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

interface Props {
    busy: boolean;
    errorMessage?: string;
    checkUsername: (username: string) => Promise<UsernameAvailability>;
    onSubmit: (username: string, displayName: string) => void;
}

const normalizeUsername = (value: string): string =>
    value.toLowerCase().replace(DISALLOWED_USERNAME_CHARS, "").slice(0, USERNAME_MAX);

const isValidUsername = (value: string): boolean => value.length >= USERNAME_MIN && value.length <= USERNAME_MAX;

const isValidDisplayName = (value: string): boolean => {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= DISPLAY_NAME_MAX;
};

function statusFromAvailability(availability: UsernameAvailability): UsernameStatus {
    switch (availability.kind) {
        case "available":
            return "available";
        case "taken":
            return "taken";
        default:
            return "invalid";
    }
}

/**
 * New-user step of the Gua onboarding flow: pick a username (normalised, with a debounced
 * real-time availability check) and a display name. Web equivalent of the iOS
 * ProfileSetupScreen. A PIN is an optional later step, so it is not collected here.
 */
export default function GuaProfileSetup({ busy, errorMessage, checkUsername, onSubmit }: Props): JSX.Element {
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [status, setStatus] = useState<UsernameStatus>("idle");

    // Debounced availability check; stale results are ignored.
    useEffect(() => {
        if (!username) {
            setStatus("idle");
            return;
        }
        if (!isValidUsername(username)) {
            setStatus("invalid");
            return;
        }
        setStatus("checking");
        let cancelled = false;
        const handle = window.setTimeout(() => {
            checkUsername(username)
                .then((result) => {
                    if (!cancelled) setStatus(statusFromAvailability(result));
                })
                .catch(() => {
                    // A transient/failed check shouldn't strand the user; the backend still
                    // rejects a taken username on completeSignup.
                    if (!cancelled) setStatus("idle");
                });
        }, 400);
        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [username, checkUsername]);

    const canSubmit =
        !busy &&
        isValidUsername(username) &&
        isValidDisplayName(displayName) &&
        (status === "available" || status === "idle");

    const submit = (ev?: SyntheticEvent): void => {
        ev?.preventDefault();
        if (canSubmit) onSubmit(username.trim(), displayName.trim());
    };

    let usernameHint: string | undefined;
    switch (status) {
        case "checking":
            usernameHint = _t("gua|profile|username_checking");
            break;
        case "available":
            usernameHint = _t("gua|profile|username_available");
            break;
        case "taken":
            usernameHint = _t("gua|profile|username_taken");
            break;
        case "invalid":
            usernameHint = _t("gua|profile|username_invalid");
            break;
        default:
            usernameHint = undefined;
    }

    return (
        <form onSubmit={submit}>
            <p className="mx_AuthBody_text">{_t("gua|profile|subtitle")}</p>
            <Field
                element="input"
                type="text"
                label={_t("gua|profile|username_label")}
                value={username}
                autoFocus
                disabled={busy}
                onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setUsername(normalizeUsername(ev.target.value))}
            />
            {usernameHint ? <div className="mx_AuthBody_text">{usernameHint}</div> : null}
            <Field
                element="input"
                type="text"
                label={_t("gua|profile|display_name_label")}
                value={displayName}
                disabled={busy}
                onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                    setDisplayName(ev.target.value.slice(0, DISPLAY_NAME_MAX))
                }
            />
            {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
            <input
                className="mx_Login_submit"
                type="submit"
                value={_t("gua|profile|create_account")}
                disabled={!canSubmit}
            />
        </form>
    );
}
