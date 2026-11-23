/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "jest-matrix-react";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

import { PHOTO_LICENCE_URLS, photoCredits } from "../../../../src/gua/chatTheme/model/artworks";
import { ChatThemePanel } from "../../../../src/gua/chatTheme/ui/ChatThemePanel";
import Modal from "../../../../src/Modal";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { Layout } from "../../../../src/settings/enums/Layout";
import { stubClient, withClientContextRenderOptions } from "../../../test-utils";
import { overrideSettings } from "./overrideSettings";

const ME = "@me:example.org";
/** Sent themes are held per room until their echo, so every test gets its own room. */
let roomCount = 0;

describe("ChatThemePanel", () => {
    let client: MatrixClient;
    let room: Room;
    let defaultTheme: MatrixEvent | undefined;
    let layout: Layout;

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
        defaultTheme = undefined;
        layout = Layout.Bubble;
        jest.spyOn(client, "getAccountData").mockImplementation((type) =>
            type === "global.gua.chat_theme" ? defaultTheme : undefined,
        );
        jest.spyOn(client, "sendStateEvent").mockResolvedValue({ event_id: "$sent" });
        jest.spyOn(room.currentState, "maySendStateEvent").mockReturnValue(true);
        overrideSettings(() => ({ layout }));
        jest.spyOn(Modal, "createDialog");
    });

    afterEach(() => jest.restoreAllMocks());

    const renderPanel = (mode: "chat" | "default" = "chat") =>
        render(
            <ChatThemePanel mode={mode} room={mode === "chat" ? room : undefined} />,
            withClientContextRenderOptions(client),
        );

    it("starts the gallery with the Default tile, selected for a chat without a theme", () => {
        renderPanel();
        const featured = screen.getByRole("radiogroup", { name: "Featured" });
        const [first] = Array.from(featured.querySelectorAll("input[type='radio']"));
        expect(first).toHaveAccessibleName("Default");
        expect(first).toBeChecked();
        expect(screen.getByText("Everyone in the chat sees this theme.")).toBeInTheDocument();
    });

    it("previews a tile, sends the apps' bytes when it is set, and says so", async () => {
        renderPanel();
        fireEvent.click(screen.getAllByRole("radio", { name: "Silk, Live" })[0]);
        expect(screen.getAllByRole("radio", { name: "Silk, Live" })[0]).toBeChecked();
        expect(screen.getByRole("radio", { name: "Default, Current" })).not.toBeChecked();
        expect(screen.getByRole("status")).toHaveTextContent("Previewing Silk, Live. Select “Set theme” to keep it.");

        fireEvent.click(screen.getByRole("button", { name: "Set theme" }));
        await waitFor(() =>
            expect(client.sendStateEvent).toHaveBeenCalledWith(
                room.roomId,
                "global.gua.room.background",
                expect.anything(),
                "",
            ),
        );
        expect(JSON.stringify(jest.mocked(client.sendStateEvent).mock.calls[0][2])).toBe(
            '{"art":"silk","bubble":"teal","fallback_preset":"mint","kind":"art","v":1}',
        );
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Theme set"));
        expect(screen.getAllByRole("radio", { name: "Silk, Live" })[0]).toHaveFocus();
    });

    it("checks a theme shown in two sections only once", () => {
        renderPanel();
        fireEvent.click(screen.getAllByRole("radio", { name: "Silk, Live" })[1]);
        const [featured, live] = screen.getAllByRole("radio", { name: "Silk, Live" });
        expect(featured).toBeChecked();
        expect(live).not.toBeChecked();
        expect(live.closest("label")).toHaveClass("mx_GuaThemeTile_selected");
    });

    it("cannot set the current theme again", () => {
        setRoomTheme({ v: 1, kind: "art", art: "guara", bubble: "green", fallback_preset: "mint" });
        renderPanel();
        expect(screen.getByRole("radio", { name: "Guará" })).toBeChecked();
        fireEvent.click(screen.getAllByRole("radio", { name: "Azulejo" })[0]);
        fireEvent.click(screen.getByRole("radio", { name: "Guará, Current" }));
        const setTheme = screen.getByRole("button", { name: "Set theme" });
        expect(setTheme).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(setTheme);
        expect(client.sendStateEvent).not.toHaveBeenCalled();
    });

    it("opens the pickers in place, never as a dialog, and comes back to the button that opened them", () => {
        renderPanel();
        fireEvent.click(screen.getByRole("button", { name: /^Chat bubble/ }));
        expect(screen.getByRole("radio", { name: "Green bubble" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByRole("button", { name: /^Chat bubble/ })).toHaveFocus();

        fireEvent.click(screen.getByRole("button", { name: /^Wallpaper/ }));
        expect(screen.getByRole("radio", { name: "No wallpaper" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("button", { name: /^Wallpaper/ })).toHaveFocus();
        expect(Modal.createDialog).not.toHaveBeenCalled();
    });

    it("announces a bubble saved from its picker", async () => {
        renderPanel();
        fireEvent.click(screen.getByRole("button", { name: /^Chat bubble/ }));
        fireEvent.click(screen.getByRole("radio", { name: "Teal bubble" }));
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Theme set"));
        expect(screen.getByRole("button", { name: "Chat bubble: Teal" })).toHaveFocus();
    });

    it("removes the chat theme with the Default tile", async () => {
        setRoomTheme({ v: 1, kind: "preset", preset: "ocean", bubble: "blue" });
        renderPanel();
        fireEvent.click(screen.getByRole("radio", { name: "Default" }));
        fireEvent.click(screen.getByRole("button", { name: "Set theme" }));
        await waitFor(() => expect(client.sendStateEvent).toHaveBeenCalled());
        expect(jest.mocked(client.sendStateEvent).mock.calls[0][2]).toEqual({});
    });

    it("disables everything without permission", () => {
        jest.spyOn(room.currentState, "maySendStateEvent").mockReturnValue(false);
        renderPanel();
        expect(screen.getByText("Only admins and moderators can change it")).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "Default" })).toBeDisabled();
        expect(screen.getByRole("button", { name: /^Wallpaper/ })).toBeDisabled();
    });

    it("names a photo tile and its photographer, and previews it from the caption too", () => {
        renderPanel();
        const lagoon = screen.getByRole("radio", { name: "Lençóis Lagoon, Photo: Gerda Arendt" });
        const caption = lagoon.closest(".mx_GuaThemeTile_photo")!.querySelector(".mx_GuaThemeTile_caption")!;
        expect(caption).toHaveTextContent(/^Lençóis LagoonPhoto: Gerda Arendt$/);
        fireEvent.click(caption);
        expect(lagoon).toBeChecked();
        expect(screen.getByRole("status")).toHaveTextContent("Previewing Lençóis Lagoon, Photo: Gerda Arendt.");
    });

    it("opens the photo credits from the Photos heading and comes back to it", () => {
        renderPanel();
        fireEvent.click(screen.getByRole("button", { name: "Photo credits" }));
        expect(screen.getByRole("heading", { name: "Photo credits" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();
        expect(screen.queryByRole("radiogroup")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.queryByRole("heading", { name: "Photo credits" })).toBeNull();
        expect(screen.getByRole("button", { name: "Photo credits" })).toHaveFocus();
    });

    it("shows a previewed photo's credit and licence, which open the credits and keep the preview", () => {
        renderPanel();
        fireEvent.click(screen.getByRole("radio", { name: "Peyto Lake, Photo: Ezra Jeffrey-Comeau" }));
        const credit = screen.getByRole("button", { name: "Photo: Ezra Jeffrey-Comeau · CC0 1.0" });
        fireEvent.click(credit);
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(credit).toHaveFocus();
        expect(screen.getByRole("radio", { name: "Peyto Lake, Photo: Ezra Jeffrey-Comeau" })).toBeChecked();
        expect(screen.getByRole("button", { name: "Set theme" })).toBeInTheDocument();
    });

    it("shows no credit line while the theme is not a photo", () => {
        setRoomTheme({ v: 1, kind: "art", art: "guara", bubble: "green", fallback_preset: "mint" });
        renderPanel();
        expect(screen.queryByRole("button", { name: /^Photo:/ })).toBeNull();
        fireEvent.click(screen.getAllByRole("radio", { name: "Silk, Live" })[0]);
        expect(screen.queryByRole("button", { name: /^Photo:/ })).toBeNull();
    });

    it("lets a member who cannot change a photo theme reach its credits, and nothing else", () => {
        jest.spyOn(room.currentState, "maySendStateEvent").mockReturnValue(false);
        setRoomTheme({
            v: 1,
            kind: "art",
            art: "photo-gruta-azul",
            bubble: "teal",
            bubble_dark: "blue",
            fallback_preset: "sky",
        });
        renderPanel();
        const tile = screen.getByRole("radio", { name: "Blue Grotto, Photo: Wilfredo Rodriguez (Wilfredor)" });
        expect(tile).toBeChecked();
        expect(tile).toBeDisabled();
        expect(screen.getByRole("button", { name: /^Wallpaper/ })).toBeDisabled();

        const credit = screen.getByRole("button", { name: "Photo: Wilfredo Rodriguez (Wilfredor) · CC0 1.0" });
        expect(credit).not.toHaveAttribute("aria-disabled");
        fireEvent.click(credit);
        expect(screen.getByRole("heading", { name: "Photo credits" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Back" }));

        const heading = screen.getByRole("button", { name: "Photo credits" });
        expect(heading).not.toHaveAttribute("aria-disabled");
        fireEvent.click(heading);
        expect(screen.getByRole("heading", { name: "Photo credits" })).toBeInTheDocument();
        expect(client.sendStateEvent).not.toHaveBeenCalled();
    });

    it("credits every photo with its author, licence, source and changes, linking out in a new tab", () => {
        renderPanel();
        fireEvent.click(screen.getByRole("button", { name: "Photo credits" }));
        const rows = screen.getAllByRole("listitem");
        expect(rows).toHaveLength(photoCredits().length);
        expect(rows[0]).toHaveTextContent(/^Lençóis LagoonPhoto: Gerda Arendt/);
        photoCredits().forEach(({ credit }, index) => {
            const row = within(rows[index]);
            expect(row.getByText(`Photo: ${credit.author}`)).toBeInTheDocument();
            expect(row.getByText("Cropped and resized for phones.")).toBeInTheDocument();
            const licence = row.getByRole("link", { name: credit.licence });
            expect(licence).toHaveAttribute("href", PHOTO_LICENCE_URLS[credit.licence]);
            expect(licence).toHaveAttribute("target", "_blank");
            expect(licence.getAttribute("rel")).toContain("noopener");
            const source = row.queryByRole("link", { name: "Source" });
            expect(source?.getAttribute("href") ?? null).toBe(credit.sourceUrl ?? null);
            expect(rows[index].querySelector(".mx_GuaPhotoCredits_thumbnail .mx_GuaWallpaper_still")).not.toBeNull();
        });
    });

    it("reports a refused send under the buttons, keeping the preview", async () => {
        jest.spyOn(client, "sendStateEvent").mockRejectedValue(new Error("forbidden"));
        renderPanel();
        fireEvent.click(screen.getAllByRole("radio", { name: "Azulejo" })[0]);
        fireEvent.click(screen.getByRole("button", { name: "Set theme" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t change the background. Try again.");
        expect(screen.getByRole("button", { name: "Set theme" })).toBeInTheDocument();
        expect(Modal.createDialog).not.toHaveBeenCalled();
    });

    it("offers the message bubbles layout outside it", () => {
        layout = Layout.Group;
        const setValue = jest.spyOn(SettingsStore, "setValue").mockResolvedValue();
        renderPanel();
        fireEvent.click(screen.getByRole("button", { name: "Use message bubbles" }));
        expect(setValue).toHaveBeenCalledWith("layout", null, "device", Layout.Bubble);
    });

    it("sets the personal default from the Classic tile's screen", async () => {
        jest.spyOn(client, "setAccountData").mockResolvedValue({});
        renderPanel("default");
        expect(screen.getByRole("radio", { name: "Classic" })).toBeChecked();
        expect(screen.getByText("Applies to every chat that doesn’t have its own theme.")).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole("radio", { name: "Paper" })[0]);
        fireEvent.click(screen.getByRole("button", { name: "Set default" }));
        await waitFor(() => expect(client.setAccountData).toHaveBeenCalled());
        expect(JSON.stringify(jest.mocked(client.setAccountData).mock.calls[0][1])).toBe(
            '{"art":"paper","bubble":"green","fallback_preset":"sand","kind":"art","v":1}',
        );
    });
});
