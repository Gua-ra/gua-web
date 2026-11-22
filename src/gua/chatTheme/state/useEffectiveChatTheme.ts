/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type Room, type RoomState } from "matrix-js-sdk/src/matrix";

import { useRoomState } from "../../../hooks/useRoomState";
import { useFeatureEnabled, useSettingValue } from "../../../hooks/useSettings";
import { Layout } from "../../../settings/enums/Layout";
import { effectiveChatTheme, isMediaShown, isPrivateJoinRule } from "../model/precedence";
import { type ChatTheme } from "../model/types";
import { useDefaultChatTheme } from "./defaultChatTheme";
import { useRoomChatTheme } from "./roomChatTheme";

const isPrivate = (state: RoomState): boolean => isPrivateJoinRule(state.getJoinRule());

/** What a chat draws: its own theme, or the default when it has none or hides its photo. */
export function useEffectiveChatTheme(client: MatrixClient, room: Room): ChatTheme {
    const chatTheme = useRoomChatTheme(room);
    const defaultTheme = useDefaultChatTheme(client);
    const roomIsPrivate = useRoomState(room, isPrivate);
    const mediaPreviews = useSettingValue("mediaPreviewConfig", room.roomId).media_previews;
    return effectiveChatTheme(chatTheme, defaultTheme, roomIsPrivate, isMediaShown(mediaPreviews, roomIsPrivate));
}

export function useChatThemesFeature(): boolean {
    return useFeatureEnabled("feature_gua_chat_themes");
}

/** Themes draw only in the message bubbles layout, the only one with an outgoing bubble to colour. */
export function useIsBubbleLayout(): boolean {
    return useSettingValue("layout") === Layout.Bubble;
}
