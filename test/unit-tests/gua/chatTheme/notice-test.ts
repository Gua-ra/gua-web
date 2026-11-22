/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, MatrixEvent, type RoomMember } from "matrix-js-sdk/src/matrix";

import { hasText, textForEvent } from "../../../../src/TextForEvent";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { stubClient } from "../../../test-utils";

const ME = "@me:example.org";

function themeEvent(sender: string, content: Record<string, unknown>): MatrixEvent {
    const event = new MatrixEvent({
        type: "global.gua.room.background",
        state_key: "",
        sender,
        room_id: "!room:example.org",
        content,
    });
    event.sender = { name: "Helena" } as RoomMember;
    return event;
}

describe("chat theme notices", () => {
    let client: MatrixClient;

    beforeEach(() => {
        client = stubClient();
        jest.spyOn(client, "getUserId").mockReturnValue(ME);
        jest.spyOn(SettingsStore, "getValue").mockImplementation((name) => name === "feature_gua_chat_themes");
    });

    afterEach(() => jest.restoreAllMocks());

    it("says who changed or removed the theme", () => {
        const preset = { v: 1, kind: "preset", preset: "aurora" };
        expect(textForEvent(themeEvent("@helena:example.org", preset), client)).toBe("Helena changed the chat theme");
        expect(textForEvent(themeEvent("@helena:example.org", {}), client)).toBe("Helena removed the chat theme");
        expect(textForEvent(themeEvent(ME, preset), client)).toBe("You changed the chat theme");
        expect(textForEvent(themeEvent(ME, {}), client)).toBe("You removed the chat theme");
    });

    it("counts unreadable content as a change", () => {
        expect(textForEvent(themeEvent(ME, { v: 2, kind: "hologram" }), client)).toBe("You changed the chat theme");
    });

    it("stays hidden without chat themes", () => {
        jest.spyOn(SettingsStore, "getValue").mockReturnValue(false);
        expect(hasText(themeEvent(ME, {}), client)).toBe(false);
    });
});
