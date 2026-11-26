/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { createRef } from "react";
import { cleanup, render, waitFor } from "jest-matrix-react";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

import ThemedChat from "../../../../src/gua/chatTheme/render/ChatWallpaper";
import { ChatThemeWallpaper } from "../../../../src/gua/chatTheme/lazy";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { Layout } from "../../../../src/settings/enums/Layout";
import { MediaPreviewValue } from "../../../../src/@types/media_preview";
import { stubClient, withClientContextRenderOptions } from "../../../test-utils";
import { overrideSettings } from "./overrideSettings";

const ME = "@me:example.org";
/** Sent themes are held per room until their echo, so every test gets its own room. */
let roomCount = 0;

describe("ChatWallpaper", () => {
    let client: MatrixClient;
    let room: Room;
    let layout: Layout;
    let defaultTheme: Record<string, unknown>;
    let mediaPreviews: MediaPreviewValue;

    function setState(type: string, content: Record<string, unknown>): void {
        room.currentState.setStateEvents([
            new MatrixEvent({ type, state_key: "", sender: ME, room_id: room.roomId, event_id: `$${type}`, content }),
        ]);
    }

    /** Mirrors RoomView's DOM. */
    function renderWallpaper(Component: typeof ThemedChat = ThemedChat) {
        const bodyRef = createRef<HTMLDivElement>();
        const result = render(
            <div className="mx_RoomView">
                <div ref={bodyRef} className="mx_RoomView_body">
                    <main className="mx_RoomView_timeline">
                        <Component room={room} bodyRef={bodyRef} />
                    </main>
                </div>
            </div>,
            withClientContextRenderOptions(client),
        );
        const roomView = (): HTMLElement => result.container.querySelector(".mx_RoomView")!;
        return { ...result, body: () => bodyRef.current!, roomView };
    }

    beforeEach(() => {
        client = stubClient();
        room = new Room(`!room${++roomCount}:example.org`, client, ME);
        layout = Layout.Bubble;
        defaultTheme = {};
        mediaPreviews = MediaPreviewValue.On;
        jest.spyOn(client, "getAccountData").mockImplementation((type) =>
            type === "global.gua.chat_theme" ? new MatrixEvent({ type, content: defaultTheme }) : undefined,
        );
        overrideSettings(() => ({
            feature_gua_chat_themes: true,
            layout,
            mediaPreviewConfig: { media_previews: mediaPreviews, invite_avatars: "on" },
        }));
    });

    afterEach(() => {
        cleanup();
        document.body.classList.remove("cpd-theme-dark");
        jest.restoreAllMocks();
    });

    it("leaves a chat without a theme untouched", () => {
        const { container, body, roomView } = renderWallpaper();
        expect(container.querySelector(".mx_GuaWallpaper")).toBeNull();
        expect(body().getAttributeNames()).toEqual(["class"]);
        expect(roomView().getAttributeNames()).toEqual(["class"]);
    });

    it("draws a preset in the timeline column and colours the outgoing bubble across the room", () => {
        setState("global.gua.room.background", { v: 1, kind: "preset", preset: "mint", bubble: "green" });
        const { container, body, roomView } = renderWallpaper();
        expect(container.querySelector(".mx_RoomView_timeline > .mx_GuaChatWallpaper")).not.toBeNull();
        expect(body().hasAttribute("data-gua-wallpaper")).toBe(true);
        expect(roomView().hasAttribute("data-gua-bubble")).toBe(true);
        expect(roomView().style.getPropertyValue("--gua-bubble-light")).toBe("#D9F4DD");
        expect(roomView().style.getPropertyValue("--gua-bubble-dark")).toBe("#173826");
    });

    it("colours the bubble of a theme without a wallpaper, drawing nothing", () => {
        setState("global.gua.room.background", { v: 1, kind: "none", bubble: "blue", bubble_dark: "purple" });
        const { container, body, roomView } = renderWallpaper();
        expect(container.querySelector(".mx_GuaWallpaper")).toBeNull();
        expect(body().hasAttribute("data-gua-wallpaper")).toBe(false);
        expect(roomView().style.getPropertyValue("--gua-bubble-dark")).toBe("#30264D");
    });

    it("shows an artwork's still on its anchor over its fallback", () => {
        setState("global.gua.room.background", {
            v: 1,
            kind: "art",
            art: "guara",
            fallback_preset: "mint",
        });
        const { container } = renderWallpaper();
        const still = container.querySelector<HTMLImageElement>(".mx_GuaWallpaper_still")!;
        expect(still.style.objectPosition).toBe("78% 19%");
        expect(container.querySelector(".mx_GuaWallpaper_grain")).not.toBeNull();
    });

    it("dims a built-in photo in dark mode like a user's own photo, over the grain", () => {
        setState("global.gua.room.background", { v: 1, kind: "art", art: "photo-ipe", fallback_preset: "graphite" });
        const light = renderWallpaper();
        expect(light.container.querySelector(".mx_GuaWallpaper_scrim")).toBeNull();
        light.unmount();

        document.body.classList.add("cpd-theme-dark");
        const { container } = renderWallpaper();
        const scrim = container.querySelector<HTMLElement>(".mx_GuaWallpaper_scrim")!;
        expect(scrim.style.opacity).toBe("0.35");
        expect(scrim.previousElementSibling).toHaveClass("mx_GuaWallpaper_grain");
    });

    it("leaves other artworks undimmed in dark mode", () => {
        document.body.classList.add("cpd-theme-dark");
        setState("global.gua.room.background", { v: 1, kind: "art", art: "guara", fallback_preset: "mint" });
        const { container } = renderWallpaper();
        expect(container.querySelector(".mx_GuaWallpaper_still")).not.toBeNull();
        expect(container.querySelector(".mx_GuaWallpaper_scrim")).toBeNull();
    });

    it("follows the default when the chat has no theme", () => {
        defaultTheme = { v: 1, kind: "preset", preset: "dusk", bubble: "purple" };
        const { roomView } = renderWallpaper();
        expect(roomView().style.getPropertyValue("--gua-bubble-light")).toBe("#E8E0F8");
    });

    it("shows the default instead of a chat photo that a public room hides", () => {
        mediaPreviews = MediaPreviewValue.Off;
        defaultTheme = { v: 1, kind: "preset", preset: "sky", bubble: "teal" };
        setState("global.gua.room.background", {
            v: 1,
            kind: "photo",
            bubble: "orange",
            photo: { url: "mxc://gua.global/a", mimetype: "image/jpeg", w: 10, h: 10, size: 100 },
        });
        setState("m.room.join_rules", { join_rule: "public" });
        const { roomView } = renderWallpaper();
        expect(roomView().style.getPropertyValue("--gua-bubble-light")).toBe("#D3F1EC");
    });

    it("counts a room without a join rules event as not private, like the apps", () => {
        mediaPreviews = MediaPreviewValue.Private;
        defaultTheme = { v: 1, kind: "preset", preset: "sky", bubble: "teal" };
        setState("global.gua.room.background", {
            v: 1,
            kind: "photo",
            bubble: "orange",
            photo: { url: "mxc://gua.global/a", mimetype: "image/jpeg", w: 10, h: 10, size: 100 },
        });
        const { roomView } = renderWallpaper();
        expect(roomView().style.getPropertyValue("--gua-bubble-light")).toBe("#D3F1EC");
    });

    it("reads the account-wide media setting, never a per-room one", () => {
        const earlier = jest.mocked(SettingsStore.getValue).getMockImplementation() as (...args: unknown[]) => unknown;
        jest.mocked(SettingsStore.getValue).mockImplementation(((name: string, roomId?: string | null) => {
            if (name === "mediaPreviewConfig") {
                return { media_previews: roomId ? MediaPreviewValue.On : MediaPreviewValue.Off, invite_avatars: "on" };
            }
            return earlier(name, roomId);
        }) as typeof SettingsStore.getValue);
        defaultTheme = { v: 1, kind: "preset", preset: "sky", bubble: "teal" };
        setState("global.gua.room.background", {
            v: 1,
            kind: "photo",
            bubble: "orange",
            photo: { url: "mxc://gua.global/a", mimetype: "image/jpeg", w: 10, h: 10, size: 100 },
        });
        setState("m.room.join_rules", { join_rule: "public" });
        const { roomView } = renderWallpaper();
        expect(roomView().style.getPropertyValue("--gua-bubble-light")).toBe("#D3F1EC");
    });

    it("removes what it set when the theme goes", () => {
        setState("global.gua.room.background", { v: 1, kind: "preset", preset: "mint", bubble: "green" });
        const { unmount, body, roomView } = renderWallpaper();
        const bodyElement = body();
        const roomElement = roomView();
        unmount();
        expect(bodyElement.getAttributeNames()).toEqual(["class"]);
        expect(roomElement.getAttributeNames()).toEqual(["class"]);
    });

    it.each([Layout.Bubble, Layout.Group])("loads the theme with chat themes on in the %s layout", async (shown) => {
        layout = shown;
        setState("global.gua.room.background", { v: 1, kind: "preset", preset: "mint", bubble: "green" });
        const { container } = renderWallpaper(ChatThemeWallpaper);
        await waitFor(() => expect(container.querySelector(".mx_GuaChatWallpaper")).not.toBeNull());
    });

    it("draws nothing in the IRC layout", () => {
        layout = Layout.IRC;
        setState("global.gua.room.background", { v: 1, kind: "preset", preset: "mint", bubble: "green" });
        const { container, body } = renderWallpaper(ChatThemeWallpaper);
        expect(container.querySelector(".mx_GuaWallpaper")).toBeNull();
        expect(body().getAttributeNames()).toEqual(["class"]);
    });
});
