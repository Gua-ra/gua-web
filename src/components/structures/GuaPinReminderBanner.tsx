/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type CSSProperties, type JSX, useEffect, useState } from "react";

import { _t } from "../../languageHandler";
import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import IdentityServiceClient from "../../identity/IdentityServiceClient";
import AccessibleButton from "../views/elements/AccessibleButton";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { type OpenToTabPayload } from "../../dispatcher/payloads/OpenToTabPayload";
import { UserTab } from "../views/dialogs/UserTab";

const DISMISS_KEY = "gua_pin_reminder_dismissed";

const bannerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    marginBottom: "16px",
    borderRadius: "8px",
    background: "var(--cpd-color-bg-subtle-secondary)",
    border: "1px solid var(--cpd-color-border-interactive-secondary)",
};

/**
 * A dismissible nudge shown on the home page when the signed-in user has not yet configured a
 * two-step verification PIN. Web equivalent of the iOS home PIN setup reminder banner.
 */
export default function GuaPinReminderBanner(): JSX.Element | null {
    const cli = useMatrixClientContext();
    const client = useState(() => IdentityServiceClient.fromConfig())[0];
    const [needsPin, setNeedsPin] = useState(false);
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "true");

    const accessToken = cli.getAccessToken();

    useEffect(() => {
        if (!client || !accessToken || dismissed) return;
        let cancelled = false;
        client
            .pinStatus(accessToken)
            .then((hasPin) => {
                if (!cancelled) setNeedsPin(!hasPin);
            })
            .catch(() => {
                /* A failed status check simply hides the nudge. */
            });
        return () => {
            cancelled = true;
        };
    }, [client, accessToken, dismissed]);

    if (!client || dismissed || !needsPin) return null;

    const onSetUp = (): void => {
        dis.dispatch<OpenToTabPayload>({ action: Action.ViewUserSettings, initialTabId: UserTab.Security });
    };

    const onDismiss = (): void => {
        localStorage.setItem(DISMISS_KEY, "true");
        setDismissed(true);
    };

    return (
        <div className="mx_GuaPinReminderBanner" style={bannerStyle} role="note">
            <span style={{ flex: 1 }}>{_t("gua|reminder|text")}</span>
            <AccessibleButton kind="primary_outline" onClick={onSetUp}>
                {_t("gua|reminder|action")}
            </AccessibleButton>
            <AccessibleButton kind="link" onClick={onDismiss}>
                {_t("gua|reminder|dismiss")}
            </AccessibleButton>
        </div>
    );
}
