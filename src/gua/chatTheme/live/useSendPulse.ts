/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useEffect, useRef } from "react";
import {
    EventStatus,
    EventType,
    type MatrixClient,
    type MatrixEvent,
    RelationType,
    type Room,
    RoomEvent,
} from "matrix-js-sdk/src/matrix";

const MAX_REMEMBERED_SENDS = 50;

/**
 * Whether a local echo is the user's own new send on the main timeline. Other devices' events have no transaction id,
 * and retries and the remote echo carry an old status.
 */
export function isNewSend(event: MatrixEvent, myUserId: string, oldStatus: EventStatus | null | undefined): boolean {
    if (oldStatus !== undefined || event.status !== EventStatus.SENDING) return false;
    if (event.getSender() !== myUserId || !event.getTxnId()) return false;
    if (event.getType() === EventType.Reaction || event.isRedaction() || event.isRelation(RelationType.Replace)) {
        return false;
    }
    return !event.threadRootId || event.isThreadRoot;
}

/** Calls `onSend` once per new send in the room. */
export function useSendPulse(client: MatrixClient, room: Room, onSend: () => void): void {
    const onSendRef = useRef(onSend);
    useEffect(() => {
        onSendRef.current = onSend;
    }, [onSend]);

    useEffect(() => {
        const seen = new Set<string>();
        const myUserId = client.getSafeUserId();
        const onLocalEcho = (
            event: MatrixEvent,
            _room: Room,
            _oldEventId?: string,
            oldStatus?: EventStatus | null,
        ): void => {
            if (!isNewSend(event, myUserId, oldStatus)) return;
            const txnId = event.getTxnId()!;
            if (seen.has(txnId)) return;
            seen.add(txnId);
            if (seen.size > MAX_REMEMBERED_SENDS) seen.delete(seen.values().next().value!);
            onSendRef.current();
        };
        room.on(RoomEvent.LocalEchoUpdated, onLocalEcho);
        return () => {
            room.off(RoomEvent.LocalEchoUpdated, onLocalEcho);
        };
    }, [client, room]);
}
