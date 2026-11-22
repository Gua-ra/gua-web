/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { createRef } from "react";
import { render } from "jest-matrix-react";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

import { ChatWallpaper } from "../../../../src/gua/chatTheme/render/ChatWallpaper";
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

    function renderWallpaper() {
        const bodyRef = createRef<HTMLDivElement>();
        const result = render(
            <div ref={bodyRef} className="mx_RoomView_body">
                <ChatWallpaper room={room} bodyRef={bodyRef} />
            </div>,
            withClientContextRenderOptions(client),
        );
        return { ...result, body: () => bodyRef.current! };
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

    afterEach(() => jest.restoreAllMocks());

    it("leaves a chat without a theme untouched", () => {
        const { container, body } = renderWallpaper();
        expect(container.querySelector(".mx_GuaWallpaper")).toBeNull();
        expect(body().getAttributeNames()).toEqual(["class"]);
    });

    it("draws a preset and colours the outgoing bubble", () => {
        setState("global.gua.room.background", { v: 1, kind: "preset", preset: "mint", bubble: "green" });
        const { container, body } = renderWallpaper();
        expect(container.querySelector(".mx_GuaChatWallpaper")).not.toBeNull();
        expect(body().hasAttribute("data-gua-wallpaper")).toBe(true);
        expect(body().hasAttribute("data-gua-bubble")).toBe(true);
        expect(body().style.getPropertyValue("--gua-bubble-light")).toBe("#D9F4DD");
        expect(body().style.getPropertyValue("--gua-bubble-dark")).toBe("#173826");
    });

    it("colours the bubble of a theme without a wallpaper, drawing nothing", () => {
        setState("global.gua.room.background", { v: 1, kind: "none", bubble: "blue", bubble_dark: "purple" });
        const { container, body } = renderWallpaper();
        expect(container.querySelector(".mx_GuaWallpaper")).toBeNull();
        expect(body().hasAttribute("data-gua-wallpaper")).toBe(false);
        expect(body().style.getPropertyValue("--gua-bubble-dark")).toBe("#30264D");
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

    it("follows the default when the chat has no theme", () => {
        defaultTheme = { v: 1, kind: "preset", preset: "dusk", bubble: "purple" };
        const { body } = renderWallpaper();
        expect(body().style.getPropertyValue("--gua-bubble-light")).toBe("#E8E0F8");
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
        const { body } = renderWallpaper();
        expect(body().style.getPropertyValue("--gua-bubble-light")).toBe("#D3F1EC");
    });

    it("removes what it set when the theme goes", () => {
        setState("global.gua.room.background", { v: 1, kind: "preset", preset: "mint", bubble: "green" });
        const { unmount, body } = renderWallpaper();
        const element = body();
        unmount();
        expect(element.getAttributeNames()).toEqual(["class"]);
        expect(element.getAttribute("style") ?? "").toBe("");
    });

    it("draws nothing outside the bubble layout", () => {
        layout = Layout.Group;
        setState("global.gua.room.background", { v: 1, kind: "preset", preset: "mint", bubble: "green" });
        const { container, body } = renderWallpaper();
        expect(container.querySelector(".mx_GuaWallpaper")).toBeNull();
        expect(body().getAttributeNames()).toEqual(["class"]);
    });
});
