/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { fireEvent, render, screen, waitFor } from "jest-matrix-react";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

import { ChatBubblePickerDialog } from "../../../../src/gua/chatTheme/ui/ChatBubblePickerDialog";
import { ChatWallpaperPickerDialog } from "../../../../src/gua/chatTheme/ui/ChatWallpaperPickerDialog";
import { stubClient } from "../../../test-utils";

const ME = "@me:example.org";
/** Sent themes are held per room until their echo, so every test gets its own room. */
let roomCount = 0;

/** Rendered without a client context, as Modal renders dialogs. */
describe("theme pickers", () => {
    let client: MatrixClient;
    let room: Room;
    let onFinished: jest.Mock;

    function setRoomTheme(content: Record<string, unknown>): void {
        room.currentState.setStateEvents([
            new MatrixEvent({
                type: "global.gua.room.background",
                state_key: "",
                sender: ME,
                room_id: room.roomId,
                event_id: "$theme",
                content,
            }),
        ]);
    }

    beforeEach(() => {
        client = stubClient();
        room = new Room(`!room${++roomCount}:example.org`, client, ME);
        onFinished = jest.fn();
        jest.spyOn(client, "sendStateEvent").mockResolvedValue({ event_id: "$sent" });
        jest.spyOn(room.currentState, "maySendStateEvent").mockReturnValue(true);
    });

    afterEach(() => jest.restoreAllMocks());

    const sent = (): string => JSON.stringify(jest.mocked(client.sendStateEvent).mock.calls[0][2]);

    it("picks one bubble for both appearances and keeps the wallpaper", async () => {
        setRoomTheme({
            v: 1,
            kind: "art",
            art: "glass-drops",
            bubble: "purple",
            bubble_dark: "pink",
            fallback_preset: "blush",
        });
        render(<ChatBubblePickerDialog mode="chat" room={room} onFinished={onFinished} />);
        expect(screen.getByRole("radio", { name: "Purple bubble" })).toHaveAttribute("aria-checked", "true");
        fireEvent.click(screen.getByRole("radio", { name: "Green bubble" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        await waitFor(() => expect(onFinished).toHaveBeenCalled());
        expect(sent()).toBe('{"art":"glass-drops","bubble":"green","fallback_preset":"blush","kind":"art","v":1}');
    });

    it("sends nothing for the bubble it starts from", () => {
        setRoomTheme({
            v: 1,
            kind: "art",
            art: "glass-drops",
            bubble: "purple",
            bubble_dark: "pink",
            fallback_preset: "blush",
        });
        render(<ChatBubblePickerDialog mode="chat" room={room} onFinished={onFinished} />);
        fireEvent.click(screen.getByRole("radio", { name: "Purple bubble" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        expect(client.sendStateEvent).not.toHaveBeenCalled();
    });

    it("keeps the bubble pair when a wallpaper is picked", async () => {
        setRoomTheme({
            v: 1,
            kind: "art",
            art: "glass-drops",
            bubble: "purple",
            bubble_dark: "pink",
            fallback_preset: "blush",
        });
        render(<ChatWallpaperPickerDialog mode="chat" room={room} onFinished={onFinished} />);
        fireEvent.click(screen.getByRole("radio", { name: "Guará" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        await waitFor(() => expect(onFinished).toHaveBeenCalled());
        expect(sent()).toBe(
            '{"art":"guara","bubble":"purple","bubble_dark":"pink","fallback_preset":"mint","kind":"art","v":1}',
        );
    });

    it("removes the theme when no wallpaper is left with the standard bubble", async () => {
        setRoomTheme({ v: 1, kind: "preset", preset: "sky" });
        render(<ChatWallpaperPickerDialog mode="chat" room={room} onFinished={onFinished} />);
        fireEvent.click(screen.getByRole("radio", { name: "No wallpaper" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        await waitFor(() => expect(onFinished).toHaveBeenCalled());
        expect(sent()).toBe("{}");
    });
});
