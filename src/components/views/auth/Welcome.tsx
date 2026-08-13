/*
Copyright 2019-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import classNames from "classnames";
import { type EmptyObject } from "matrix-js-sdk/src/matrix";

import SdkConfig from "../../../SdkConfig";
import AuthPage from "./AuthPage";
import SettingsStore from "../../../settings/SettingsStore";
import { UIFeature } from "../../../settings/UIFeature";
import LanguageSelector from "./LanguageSelector";
import EmbeddedPage from "../../structures/EmbeddedPage";
import { MATRIX_LOGO_HTML } from "../../structures/static-page-vars";
import { GUA_WEB_REGISTRATION_DISABLED_MESSAGE, GUA_WEB_REGISTRATION_ENABLED } from "../../../gua/config";

function escapeHtmlAttribute(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export default class Welcome extends React.PureComponent<EmptyObject> {
    public render(): React.ReactNode {
        const pagesConfig = SdkConfig.getObject("embedded_pages");
        const brandingConfig = SdkConfig.getObject("branding");
        const registrationEnabled = GUA_WEB_REGISTRATION_ENABLED && SettingsStore.getValue(UIFeature.Registration);
        const registrationDisabledMessage =
            brandingConfig?.get("registration_disabled_message")?.trim() || GUA_WEB_REGISTRATION_DISABLED_MESSAGE;
        const showDisabledRegistration = !registrationEnabled && !!registrationDisabledMessage;
        let pageUrl: string | undefined;
        if (pagesConfig) {
            pageUrl = pagesConfig.get("welcome_url");
        }

        const replaceMap: Record<string, string> = {
            "$riot:ssoUrl": "#/start_sso",
            "$riot:casUrl": "#/start_cas",
            "$matrixLogo": MATRIX_LOGO_HTML,
            "[matrix]": MATRIX_LOGO_HTML,
            "$registrationLinkAttributes": registrationEnabled
                ? 'href="#/register"'
                : [
                      'role="link"',
                      'aria-disabled="true"',
                      'tabindex="0"',
                      registrationDisabledMessage ? `title="${escapeHtmlAttribute(registrationDisabledMessage)}"` : "",
                  ]
                      .filter(Boolean)
                      .join(" "),
        };

        if (!pageUrl) {
            // Fall back to default and replace $logoUrl in welcome.html
            const logoUrl =
                brandingConfig?.get("welcome_logo_url") ??
                brandingConfig?.get("auth_header_logo_url") ??
                "themes/element/img/logos/logo.png";
            replaceMap["$logoUrl"] = logoUrl;
            pageUrl = "welcome.html";
        }

        return (
            <AuthPage>
                <div
                    className={classNames("mx_Welcome", {
                        mx_WelcomePage_registrationDisabled: !registrationEnabled,
                        mx_WelcomePage_showDisabledRegistration: showDisabledRegistration,
                    })}
                    data-testid="mx_welcome_screen"
                >
                    <EmbeddedPage className="mx_WelcomePage" url={pageUrl} replaceMap={replaceMap} />
                    <LanguageSelector />
                </div>
            </AuthPage>
        );
    }
}
