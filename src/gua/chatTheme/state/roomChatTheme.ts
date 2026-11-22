/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useCallback, useMemo, useState } from "react";
import {
    type MatrixClient,
    type MatrixEvent,
    type Room,
    type RoomState,
    RoomStateEvent,
    TypedEventEmitter,
} from "matrix-js-sdk/src/matrix";

import { useTypedEventEmitter } from "../../../hooks/useEventEmitter";
import { useRoomState } from "../../../hooks/useRoomState";
import { decodeChatTheme, encodeChatTheme } from "../model/codec";
import { CHAT_BACKGROUND_EVENT_TYPE } from "../model/constants";
import { type ChatTheme } from "../model/types";

const CHANGED = "changed";

interface PendingTheme {
    content: Record<string, unknown>;
    /** The state event the send replaced: while room state still holds it, the sent theme shows instead. */
    sentOver?: string;
}

const themeEvent = (state: RoomState): MatrixEvent | null => state.getStateEvents(CHAT_BACKGROUND_EVENT_TYPE, "");

/**
 * Themes sent from this device, held until the sync echo so the chat does not flash back to its old theme. An entry
 * goes with the room's next theme event, whichever it is. None is kept when the echo came first, or when the server
 * answered with the event it already had, as it does for the same content sent again.
 */
class PendingRoomThemes extends TypedEventEmitter<typeof CHANGED, { [CHANGED]: () => void }> {
    private readonly pending = new Map<string, PendingTheme & { stop: () => void }>();

    public get(roomId: string): PendingTheme | undefined {
        return this.pending.get(roomId);
    }

    public async send(client: MatrixClient, room: Room, theme: ChatTheme): Promise<void> {
        const content = encodeChatTheme(theme);
        const sentOver = themeEvent(room.currentState)?.getId();
        const { event_id: eventId } = await client.sendStateEvent(room.roomId, CHAT_BACKGROUND_EVENT_TYPE, content, "");
        const state = room.currentState;
        const current = themeEvent(state)?.getId();
        this.clear(room.roomId);
        if (current !== sentOver || eventId === current) return;

        const onState = (event: MatrixEvent): void => {
            if (event.getType() === CHAT_BACKGROUND_EVENT_TYPE && event.getStateKey() === "") this.clear(room.roomId);
        };
        state.on(RoomStateEvent.Events, onState);
        this.pending.set(room.roomId, { content, sentOver, stop: () => state.off(RoomStateEvent.Events, onState) });
        this.emit(CHANGED);
    }

    private clear(roomId: string): void {
        const entry = this.pending.get(roomId);
        if (!entry) return;
        entry.stop();
        this.pending.delete(roomId);
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
    const [, setPendingVersion] = useState(0);
    useTypedEventEmitter(
        pendingThemes,
        CHANGED,
        useCallback(() => setPendingVersion((version) => version + 1), []),
    );
    // Read by room on every render, so a component that moves to another room never shows this one's send.
    const pending = room ? pendingThemes.get(room.roomId) : undefined;
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
