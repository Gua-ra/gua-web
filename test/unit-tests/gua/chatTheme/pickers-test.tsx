/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "jest-matrix-react";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

import { ChatBubblePicker } from "../../../../src/gua/chatTheme/ui/ChatBubblePicker";
import { ChatWallpaperPicker } from "../../../../src/gua/chatTheme/ui/ChatWallpaperPicker";
import { useThemeScreen } from "../../../../src/gua/chatTheme/ui/useThemeScreen";
import { stubClient, withClientContextRenderOptions } from "../../../test-utils";

const ME = "@me:example.org";
/** Sent themes are held per room until their echo, so every test gets its own room. */
let roomCount = 0;

describe("theme pickers", () => {
    let client: MatrixClient;
    let room: Room;
    let onSaved: jest.Mock;
    let onBack: jest.Mock;

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

    function Bubbles(): React.JSX.Element {
        return <ChatBubblePicker screen={useThemeScreen("chat", room)} onBack={onBack} onSaved={onSaved} />;
    }

    function Wallpapers(): React.JSX.Element {
        return (
            <ChatWallpaperPicker
                screen={useThemeScreen("chat", room)}
                onBack={onBack}
                onSaved={onSaved}
                onPhoto={jest.fn()}
            />
        );
    }

    const glassDrops = {
        v: 1,
        kind: "art",
        art: "glass-drops",
        bubble: "purple",
        bubble_dark: "pink",
        fallback_preset: "blush",
    };

    beforeEach(() => {
        client = stubClient();
        room = new Room(`!room${++roomCount}:example.org`, client, ME);
        onSaved = jest.fn();
        onBack = jest.fn();
        jest.spyOn(client, "sendStateEvent").mockResolvedValue({ event_id: "$sent" });
        jest.spyOn(room.currentState, "maySendStateEvent").mockReturnValue(true);
    });

    afterEach(() => {
        cleanup();
        document.body.classList.remove("cpd-theme-dark");
        jest.restoreAllMocks();
    });

    const sent = (): string => JSON.stringify(jest.mocked(client.sendStateEvent).mock.calls[0][2]);

    it("picks one bubble for both appearances and keeps the wallpaper", async () => {
        setRoomTheme(glassDrops);
        render(<Bubbles />, withClientContextRenderOptions(client));
        expect(screen.getByRole("radio", { name: "Purple bubble" })).toBeChecked();
        fireEvent.click(screen.getByRole("radio", { name: "Green bubble" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(sent()).toBe('{"art":"glass-drops","bubble":"green","fallback_preset":"blush","kind":"art","v":1}');
    });

    it("sends nothing for the bubble it starts from", () => {
        setRoomTheme(glassDrops);
        render(<Bubbles />, withClientContextRenderOptions(client));
        fireEvent.click(screen.getByRole("radio", { name: "Purple bubble" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        expect(client.sendStateEvent).not.toHaveBeenCalled();
    });

    it("checks the bubble dark appearance shows, and lets it pick the light one alone", async () => {
        document.body.classList.add("cpd-theme-dark");
        setRoomTheme(glassDrops);
        render(<Bubbles />, withClientContextRenderOptions(client));
        expect(screen.getByRole("radio", { name: "Pink bubble" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Purple bubble" })).not.toBeChecked();

        fireEvent.click(screen.getByRole("radio", { name: "Purple bubble" }));
        expect(screen.getByRole("radio", { name: "Purple bubble" })).toBeChecked();
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(sent()).toBe('{"art":"glass-drops","bubble":"purple","fallback_preset":"blush","kind":"art","v":1}');
    });

    it("keeps the pair when dark appearance picks the bubble it already shows", () => {
        document.body.classList.add("cpd-theme-dark");
        setRoomTheme(glassDrops);
        render(<Bubbles />, withClientContextRenderOptions(client));
        fireEvent.click(screen.getByRole("radio", { name: "Pink bubble" }));
        expect(screen.getByRole("button", { name: "Set" })).toHaveAttribute("aria-disabled", "true");
    });

    it("keeps the bubble pair when a wallpaper is picked", async () => {
        setRoomTheme(glassDrops);
        render(<Wallpapers />, withClientContextRenderOptions(client));
        fireEvent.click(screen.getByRole("radio", { name: "Guará" }));
        expect(screen.getByRole("radio", { name: "Glass Drops, Live, Current" })).not.toBeChecked();
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(sent()).toBe(
            '{"art":"guara","bubble":"purple","bubble_dark":"pink","fallback_preset":"mint","kind":"art","v":1}',
        );
    });

    it("removes the theme when no wallpaper is left with the standard bubble", async () => {
        setRoomTheme({ v: 1, kind: "preset", preset: "sky" });
        render(<Wallpapers />, withClientContextRenderOptions(client));
        fireEvent.click(screen.getByRole("radio", { name: "No wallpaper" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(sent()).toBe("{}");
    });

    it("shows a refused save under its buttons and stays open", async () => {
        jest.spyOn(client, "sendStateEvent").mockRejectedValue(new Error("forbidden"));
        setRoomTheme({ v: 1, kind: "preset", preset: "sky" });
        render(<Wallpapers />, withClientContextRenderOptions(client));
        fireEvent.click(screen.getByRole("radio", { name: "Guará" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t change the background. Try again.");
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("names each gallery section from its heading, as one choice", () => {
        render(<Wallpapers />, withClientContextRenderOptions(client));
        const live = screen.getByRole("radiogroup", { name: "Live" });
        expect(live).toHaveAttribute("aria-labelledby", screen.getByRole("heading", { name: "Live" }).id);
        const names = new Set(screen.getAllByRole("radio").map((radio) => radio.getAttribute("name")));
        expect(names.size).toBe(1);
    });

    it("goes back with Back and Cancel, and focuses Back when it opens", () => {
        render(<Bubbles />, withClientContextRenderOptions(client));
        expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(onBack).toHaveBeenCalledTimes(2);
    });
});
