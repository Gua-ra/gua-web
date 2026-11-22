/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../languageHandler";
import SettingsTab from "../../../components/views/settings/tabs/SettingsTab";
import { SettingsSection } from "../../../components/views/settings/shared/SettingsSection";
import { ChatThemePanel } from "./ChatThemePanel";

export function ChatThemeRoomSettingsTab({ room }: { room: Room }): JSX.Element {
    return (
        <SettingsTab>
            <SettingsSection heading={_t("gua|chat_theme|title")}>
                <ChatThemePanel mode="chat" room={room} />
            </SettingsSection>
        </SettingsTab>
    );
}
