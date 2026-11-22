/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { EventType, type MatrixClient, type Room, type RoomState } from "matrix-js-sdk/src/matrix";

import { useRoomState } from "../../../hooks/useRoomState";
import { useSettingValue } from "../../../hooks/useSettings";
import { effectiveChatTheme, isMediaShown, isPrivateJoinRule } from "../model/precedence";
import { type ChatTheme } from "../model/types";
import { useDefaultChatTheme } from "./defaultChatTheme";
import { useRoomChatTheme } from "./roomChatTheme";

/**
 * The join rule as sent, like the apps: a room without a join rules event is not private, although the SDK's
 * `getJoinRule` calls it invite-only.
 */
export const isPrivateRoom = (state: RoomState): boolean =>
    isPrivateJoinRule(state.getStateEvents(EventType.RoomJoinRules, "")?.getContent().join_rule);

/**
 * The media previews setting as the apps read it: the account-wide value, never a per-room override, so a chat shows
 * the same photo on every device.
 */
export function useMediaPreviews(): string | undefined {
    return useSettingValue("mediaPreviewConfig").media_previews;
}

/** What a chat draws: its own theme, or the default when it has none or hides its photo. */
export function useEffectiveChatTheme(client: MatrixClient, room: Room): ChatTheme {
    const chatTheme = useRoomChatTheme(room);
    const defaultTheme = useDefaultChatTheme(client);
    const roomIsPrivate = useRoomState(room, isPrivateRoom);
    const mediaPreviews = useMediaPreviews();
    return effectiveChatTheme(chatTheme, defaultTheme, roomIsPrivate, isMediaShown(mediaPreviews, roomIsPrivate));
}
