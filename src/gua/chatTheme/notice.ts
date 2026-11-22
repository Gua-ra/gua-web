/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { _t } from "../../languageHandler";
import SettingsStore from "../../settings/SettingsStore";
import { getSenderName } from "../../utils/event/getSenderName";
import { isRemovalContent } from "./model/codec";

/** The timeline notice for a chat theme change. Without chat themes there is none, so the event stays hidden. */
export function textForChatThemeEvent(event: MatrixEvent, client: MatrixClient): (() => string) | null {
    if (!SettingsStore.getValue("feature_gua_chat_themes")) return null;
    const removed = isRemovalContent(event.getContent());
    if (event.getSender() === client.getUserId()) {
        return () =>
            removed ? _t("gua|chat_theme|notice|removed_by_you") : _t("gua|chat_theme|notice|changed_by_you");
    }
    const senderName = getSenderName(event);
    return () =>
        removed
            ? _t("gua|chat_theme|notice|removed", { senderName })
            : _t("gua|chat_theme|notice|changed", { senderName });
}
