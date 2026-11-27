/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { renderHook } from "jest-matrix-react";
import { EventStatus, MatrixEvent, type MatrixClient, Room, RoomEvent } from "matrix-js-sdk/src/matrix";

import { isNewSend, useSendPulse } from "../../../../src/gua/chatTheme/live/useSendPulse";
import { stubClient } from "../../../test-utils";

const ME = "@me:example.org";

function localEcho(
    content: Record<string, unknown> = { msgtype: "m.text", body: "hi" },
    options: { type?: string; sender?: string; txnId?: string | null; status?: EventStatus } = {},
): MatrixEvent {
    const event = new MatrixEvent({
        type: options.type ?? "m.room.message",
        sender: options.sender ?? ME,
        room_id: "!room:example.org",
        content,
    });
    event.setStatus(options.status ?? EventStatus.SENDING);
    if (options.txnId !== null) event.setTxnId(options.txnId ?? "txn1");
    return event;
}

describe("send pulse", () => {
    it("counts a new local echo of the user's own message", () => {
        expect(isNewSend(localEcho(), ME, undefined)).toBe(true);
        expect(isNewSend(localEcho({ msgtype: "m.image", body: "a.png" }), ME, undefined)).toBe(true);
        expect(isNewSend(localEcho({ body: "sticker" }, { type: "m.sticker" }), ME, undefined)).toBe(true);
    });

    it("counts nothing for other senders, status changes or retries", () => {
        expect(isNewSend(localEcho({}, { sender: "@other:example.org" }), ME, undefined)).toBe(false);
        expect(isNewSend(localEcho({}, { txnId: null }), ME, undefined)).toBe(false);
        expect(isNewSend(localEcho(), ME, EventStatus.SENDING)).toBe(false);
        expect(isNewSend(localEcho(), ME, null)).toBe(false);
        expect(isNewSend(localEcho({}, { status: EventStatus.NOT_SENT }), ME, undefined)).toBe(false);
    });

    it("counts nothing for reactions, redactions, edits or thread replies", () => {
        const relatesTo = (relation: Record<string, unknown>) => ({ "m.relates_to": relation, "body": "x" });
        expect(
            isNewSend(
                localEcho(relatesTo({ rel_type: "m.annotation", event_id: "$a", key: "👍" }), { type: "m.reaction" }),
                ME,
                undefined,
            ),
        ).toBe(false);
        expect(isNewSend(localEcho({}, { type: "m.room.redaction" }), ME, undefined)).toBe(false);
        expect(isNewSend(localEcho(relatesTo({ rel_type: "m.replace", event_id: "$a" })), ME, undefined)).toBe(false);
        expect(isNewSend(localEcho(relatesTo({ rel_type: "m.thread", event_id: "$root" })), ME, undefined)).toBe(false);
    });

    it("pulses once per transaction, only for echoes after it starts listening", () => {
        const client: MatrixClient = stubClient();
        jest.spyOn(client, "getSafeUserId").mockReturnValue(ME);
        const room = new Room("!room:example.org", client, ME);
        room.emit(RoomEvent.LocalEchoUpdated, localEcho({}, { txnId: "before" }), room);

        const onSend = jest.fn();
        renderHook(() => useSendPulse(client, room, onSend));
        const echo = localEcho({ msgtype: "m.text", body: "hi" }, { txnId: "t1" });
        room.emit(RoomEvent.LocalEchoUpdated, echo, room);
        room.emit(RoomEvent.LocalEchoUpdated, echo, room);
        room.emit(RoomEvent.LocalEchoUpdated, echo, room, "~old", EventStatus.SENDING);
        room.emit(RoomEvent.LocalEchoUpdated, localEcho({}, { txnId: "t2" }), room);
        expect(onSend).toHaveBeenCalledTimes(2);
    });
});
