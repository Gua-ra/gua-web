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

/** Like the apps, a room without a join rules event is not private, though the SDK's `getJoinRule` says invite-only. */
export const isPrivateRoom = (state: RoomState): boolean =>
    isPrivateJoinRule(state.getStateEvents(EventType.RoomJoinRules, "")?.getContent().join_rule);

/** The account-wide value, ignoring per-room overrides as the apps do, so a chat shows the same photo everywhere. */
export function useMediaPreviews(): string | undefined {
    return useSettingValue("mediaPreviewConfig").media_previews;
}

export function useEffectiveChatTheme(client: MatrixClient, room: Room): ChatTheme {
    const chatTheme = useRoomChatTheme(room);
    const defaultTheme = useDefaultChatTheme(client);
    const roomIsPrivate = useRoomState(room, isPrivateRoom);
    const mediaPreviews = useMediaPreviews();
    return effectiveChatTheme(chatTheme, defaultTheme, roomIsPrivate, isMediaShown(mediaPreviews, roomIsPrivate));
}
