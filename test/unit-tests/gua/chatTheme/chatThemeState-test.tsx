/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { act, renderHook } from "jest-matrix-react";
import { ClientEvent, type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

import { DefaultChatThemeStore, useDefaultChatTheme } from "../../../../src/gua/chatTheme/state/defaultChatTheme";
import { sendChatTheme, useRoomChatTheme } from "../../../../src/gua/chatTheme/state/roomChatTheme";
import { presetTheme, STOCK } from "../../../../src/gua/chatTheme/model/types";
import { stubClient } from "../../../test-utils";

const ME = "@me:example.org";
/** Sent themes are held per room until their echo, so every test gets its own room. */
let roomCount = 0;

function accountData(content: Record<string, unknown>): MatrixEvent {
    return new MatrixEvent({ type: "global.gua.chat_theme", content });
}

describe("personal default theme", () => {
    let client: MatrixClient;
    let stored: MatrixEvent | undefined;

    beforeEach(() => {
        client = stubClient();
        stored = undefined;
        jest.spyOn(client, "getAccountData").mockImplementation(() => stored);
    });

    it("reads the account data and follows changes", () => {
        stored = accountData({ v: 1, kind: "preset", preset: "dusk", bubble: "purple" });
        const { result } = renderHook(() => useDefaultChatTheme(client));
        expect(result.current).toEqual(presetTheme("dusk", "purple"));

        act(() => {
            stored = accountData({});
            client.emit(ClientEvent.AccountData, stored);
        });
        expect(result.current).toEqual(STOCK);
    });

    it("shows a write at once and writes the apps' bytes", async () => {
        let finish!: () => void;
        jest.spyOn(client, "setAccountData").mockReturnValue(new Promise((resolve) => (finish = () => resolve({}))));
        const { result } = renderHook(() => useDefaultChatTheme(client));

        let write!: Promise<void>;
        act(() => {
            write = DefaultChatThemeStore.for(client).set(presetTheme("aurora", "green"));
        });
        expect(result.current).toEqual(presetTheme("aurora", "green"));
        expect(JSON.stringify(jest.mocked(client.setAccountData).mock.calls[0][1])).toBe(
            '{"bubble":"green","kind":"preset","preset":"aurora","v":1}',
        );

        await act(async () => {
            stored = accountData({ v: 1, kind: "preset", preset: "aurora", bubble: "green" });
            finish();
            await write;
        });
        expect(result.current).toEqual(presetTheme("aurora", "green"));
    });

    it("never brings back a finished write when a later one is refused", async () => {
        const writes: { resolve: () => void; reject: () => void }[] = [];
        jest.spyOn(client, "setAccountData").mockImplementation(
            () =>
                new Promise((resolve, reject) =>
                    writes.push({ resolve: () => resolve({}), reject: () => reject(new Error("refused")) }),
                ),
        );
        const { result } = renderHook(() => useDefaultChatTheme(client));
        const store = DefaultChatThemeStore.for(client);

        let first!: Promise<void>;
        let second!: Promise<void>;
        act(() => {
            first = store.set(presetTheme("aurora", "green"));
            second = store.set(presetTheme("dusk", "purple"));
        });
        expect(result.current).toEqual(presetTheme("dusk", "purple"));

        await act(async () => {
            stored = accountData({ v: 1, kind: "preset", preset: "aurora", bubble: "green" });
            writes[0].resolve();
            await first;
        });
        expect(result.current).toEqual(presetTheme("dusk", "purple"));

        await act(async () => {
            writes[1].reject();
            await expect(second).rejects.toThrow("refused");
        });
        expect(result.current).toEqual(presetTheme("aurora", "green"));

        act(() => {
            stored = accountData({ v: 1, kind: "preset", preset: "ocean", bubble: "blue" });
            client.emit(ClientEvent.AccountData, stored);
        });
        expect(result.current).toEqual(presetTheme("ocean", "blue"));
    });

    it("rolls back a refused write", async () => {
        stored = accountData({ v: 1, kind: "preset", preset: "night" });
        jest.spyOn(client, "setAccountData").mockRejectedValue(new Error("refused"));
        const { result } = renderHook(() => useDefaultChatTheme(client));

        await act(async () => {
            await expect(DefaultChatThemeStore.for(client).set(STOCK)).rejects.toThrow("refused");
        });
        expect(result.current).toEqual(presetTheme("night", "standard"));
    });
});

describe("room theme", () => {
    let client: MatrixClient;
    let room: Room;

    function setTheme(eventId: string, content: Record<string, unknown>): void {
        const event = new MatrixEvent({
            type: "global.gua.room.background",
            state_key: "",
            sender: ME,
            room_id: room.roomId,
            event_id: eventId,
            content,
        });
        room.currentState.setStateEvents([event]);
    }

    beforeEach(() => {
        client = stubClient();
        room = new Room(`!room${++roomCount}:example.org`, client, ME);
    });

    it("reads the room state and treats unreadable content as no theme", () => {
        setTheme("$1", { v: 1, kind: "preset", preset: "ocean", bubble: "teal" });
        const { result } = renderHook(() => useRoomChatTheme(room));
        expect(result.current).toEqual(presetTheme("ocean", "teal"));

        act(() => setTheme("$2", { v: 1, kind: "hologram" }));
        expect(result.current).toEqual(STOCK);
    });

    it("holds a sent theme until room state moves past the event it replaced", async () => {
        setTheme("$1", { v: 1, kind: "preset", preset: "ocean" });
        jest.spyOn(client, "sendStateEvent").mockResolvedValue({ event_id: "$2" });
        const { result } = renderHook(() => useRoomChatTheme(room));

        await act(() => sendChatTheme(client, room, presetTheme("dawn", "pink")));
        expect(client.sendStateEvent).toHaveBeenCalledWith(
            room.roomId,
            "global.gua.room.background",
            { bubble: "pink", kind: "preset", preset: "dawn", v: 1 },
            "",
        );
        expect(result.current).toEqual(presetTheme("dawn", "pink"));

        act(() => setTheme("$3", { v: 1, kind: "preset", preset: "night" }));
        expect(result.current).toEqual(presetTheme("night", "standard"));
    });

    it("keeps nothing when the echo arrives before the send returns", async () => {
        setTheme("$1", { v: 1, kind: "preset", preset: "ocean" });
        jest.spyOn(client, "sendStateEvent").mockImplementation(async () => {
            setTheme("$2", { v: 1, kind: "preset", preset: "dawn", bubble: "pink" });
            return { event_id: "$2" };
        });
        const { result } = renderHook(() => useRoomChatTheme(room));
        await act(() => sendChatTheme(client, room, presetTheme("dawn", "pink")));
        expect(result.current).toEqual(presetTheme("dawn", "pink"));

        act(() => setTheme("$3", { v: 1, kind: "preset", preset: "night" }));
        expect(result.current).toEqual(presetTheme("night", "standard"));
    });

    it("keeps nothing when the server answers with the event it already had", async () => {
        setTheme("$1", { v: 1, kind: "preset", preset: "ocean" });
        jest.spyOn(client, "sendStateEvent").mockResolvedValue({ event_id: "$1" });
        const { result } = renderHook(() => useRoomChatTheme(room));
        await act(() => sendChatTheme(client, room, presetTheme("ocean", "standard")));
        expect(result.current).toEqual(presetTheme("ocean", "standard"));
    });

    it("never shows one room's send in another room", async () => {
        jest.spyOn(client, "sendStateEvent").mockResolvedValue({ event_id: "$2" });
        const other = new Room(`!room${++roomCount}:example.org`, client, ME);
        await sendChatTheme(client, room, presetTheme("dawn", "pink"));
        const { result, rerender } = renderHook(({ shown }) => useRoomChatTheme(shown), {
            initialProps: { shown: room },
        });
        expect(result.current).toEqual(presetTheme("dawn", "pink"));
        rerender({ shown: other });
        expect(result.current).toEqual(STOCK);
    });

    it("removes the theme with empty content", async () => {
        jest.spyOn(client, "sendStateEvent").mockResolvedValue({ event_id: "$2" });
        await sendChatTheme(client, room, STOCK);
        expect(jest.mocked(client.sendStateEvent).mock.calls[0][2]).toEqual({});
    });
});
