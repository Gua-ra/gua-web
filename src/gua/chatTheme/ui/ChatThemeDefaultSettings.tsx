/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useId, useState } from "react";
import { Button } from "@vector-im/compound-web";

import { _t } from "../../../languageHandler";
import { SettingsSubsection } from "../../../components/views/settings/shared/SettingsSubsection";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { themeName } from "../model/names";
import { isStock } from "../model/types";
import { useDefaultChatTheme } from "../state/defaultChatTheme";
import { useAppearance } from "../state/useAppearance";
import { ChatThemePanel } from "./ChatThemePanel";
import { ThemeSample } from "./ChatThemeTile";

/**
 * The personal default in the Appearance settings. Change opens the theme screen right here rather than in a dialog
 * of its own, which would replace the settings dialog.
 */
export default function ChatThemeDefaultSettings(): JSX.Element {
    const client = useMatrixClientContext();
    const theme = useDefaultChatTheme(client);
    const appearance = useAppearance();
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const name = isStock(theme) ? _t("gua|chat_theme|classic") : themeName(theme, appearance.dark);
    return (
        <SettingsSubsection
            heading={_t("gua|chat_theme|title")}
            description={_t("gua|chat_theme|default_note")}
            legacy={false}
        >
            <div className="mx_GuaThemeDefault">
                <div className="mx_GuaThemeTile" aria-hidden={true}>
                    <ThemeSample wallpaper={theme.wallpaper} bubbles={theme} appearance={appearance} />
                </div>
                <span className="mx_GuaThemeDefault_name">{name}</span>
                <Button
                    className="mx_Dialog_nonDialogButton"
                    kind="secondary"
                    size="sm"
                    aria-expanded={open}
                    aria-controls={open ? panelId : undefined}
                    onClick={() => setOpen(!open)}
                >
                    {open ? _t("action|done") : _t("action|change")}
                </Button>
            </div>
            {open && (
                <div id={panelId}>
                    <ChatThemePanel mode="default" />
                </div>
            )}
        </SettingsSubsection>
    );
}
