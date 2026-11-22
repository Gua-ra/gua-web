/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { Button } from "@vector-im/compound-web";

import { _t } from "../../../languageHandler";
import Modal from "../../../Modal";
import BaseDialog from "../../../components/views/dialogs/BaseDialog";
import { SettingsSubsection } from "../../../components/views/settings/shared/SettingsSubsection";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { themeName } from "../model/names";
import { isStock } from "../model/types";
import { useDefaultChatTheme } from "../state/defaultChatTheme";
import { useAppearance } from "../state/useAppearance";
import { useChatThemesFeature } from "../state/useEffectiveChatTheme";
import { ChatThemePanel } from "./ChatThemePanel";
import { ThemeSample } from "./ChatThemeTile";

function ChatThemeDefaultDialog({ onFinished }: { onFinished: () => void }): JSX.Element {
    return (
        <BaseDialog
            className="mx_GuaThemePickerDialog"
            title={_t("gua|chat_theme|title")}
            onFinished={onFinished}
            fixedWidth={false}
        >
            <ChatThemePanel mode="default" />
        </BaseDialog>
    );
}

function DefaultChatTheme(): JSX.Element {
    const client = useMatrixClientContext();
    const theme = useDefaultChatTheme(client);
    const appearance = useAppearance();
    const open = (): void => {
        Modal.createDialog(ChatThemeDefaultDialog);
    };
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
                <Button className="mx_Dialog_nonDialogButton" kind="secondary" size="sm" onClick={open}>
                    {_t("action|change")}
                </Button>
            </div>
        </SettingsSubsection>
    );
}

export function ChatThemeDefaultSettings(): JSX.Element | null {
    return useChatThemesFeature() ? <DefaultChatTheme /> : null;
}
