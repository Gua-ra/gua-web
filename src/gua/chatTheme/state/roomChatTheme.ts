/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useCallback, useMemo } from "react";
import {
    type MatrixClient,
    type MatrixEvent,
    type Room,
    type RoomState,
    TypedEventEmitter,
} from "matrix-js-sdk/src/matrix";

import { useTypedEventEmitterState } from "../../../hooks/useEventEmitter";
import { useRoomState } from "../../../hooks/useRoomState";
import { decodeChatTheme, encodeChatTheme } from "../model/codec";
import { CHAT_BACKGROUND_EVENT_TYPE } from "../model/constants";
import { type ChatTheme } from "../model/types";

const CHANGED = "changed";

interface PendingTheme {
    content: Record<string, unknown>;
    /** The state event the send replaced: once room state moves past it, it holds the sent theme or a newer one. */
    sentOver?: string;
}

const themeEvent = (state: RoomState): MatrixEvent | null => state.getStateEvents(CHAT_BACKGROUND_EVENT_TYPE, "");

/** Themes sent from this device, held until the sync echo so the chat does not flash back to its old theme. */
class PendingRoomThemes extends TypedEventEmitter<typeof CHANGED, { [CHANGED]: () => void }> {
    private readonly pending = new Map<string, PendingTheme>();

    public get(roomId: string): PendingTheme | undefined {
        return this.pending.get(roomId);
    }

    public async send(client: MatrixClient, room: Room, theme: ChatTheme): Promise<void> {
        const content = encodeChatTheme(theme);
        const sentOver = themeEvent(room.currentState)?.getId();
        await client.sendStateEvent(room.roomId, CHAT_BACKGROUND_EVENT_TYPE, content, "");
        this.pending.set(room.roomId, { content, sentOver });
        this.emit(CHANGED);
    }
}

const pendingThemes = new PendingRoomThemes();

/** Sends the chat's theme; STOCK sends `{}`, which removes it. */
export function sendChatTheme(client: MatrixClient, room: Room, theme: ChatTheme): Promise<void> {
    return pendingThemes.send(client, room, theme);
}

/** The chat's own theme, STOCK when it has none or the app cannot read it. */
export function useRoomChatTheme(room: Room | undefined): ChatTheme {
    const event = useRoomState(room, themeEvent);
    const readPending = useCallback(() => (room ? pendingThemes.get(room.roomId) : undefined), [room]);
    const pending = useTypedEventEmitterState(pendingThemes, CHANGED, readPending);
    const content = pending && event?.getId() === pending.sentOver ? pending.content : event?.getContent();
    return useMemo(() => decodeChatTheme(content), [content]);
}

export function useCanChangeChatTheme(room: Room | undefined, client: MatrixClient): boolean {
    const userId = client.getSafeUserId();
    const mayChange = useCallback(
        (state: RoomState) => state.maySendStateEvent(CHAT_BACKGROUND_EVENT_TYPE, userId),
        [userId],
    );
    return useRoomState(room, mayChange) ?? false;
}
