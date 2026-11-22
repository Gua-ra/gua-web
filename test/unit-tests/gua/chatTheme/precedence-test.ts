/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import fixtures from "./fixtures/chat-theme-precedence-fixtures.json";
import { decodeChatTheme } from "../../../../src/gua/chatTheme/model/codec";
import { effectiveChatTheme, isMediaShown, isPrivateJoinRule } from "../../../../src/gua/chatTheme/model/precedence";
import { toFixture } from "./fixtureForm";

describe("chat theme precedence", () => {
    it.each(fixtures.cases.map((c) => [c.name, c] as const))("%s", (_name, fixture) => {
        const effective = effectiveChatTheme(
            decodeChatTheme(fixture.chatTheme),
            decodeChatTheme(fixture.defaultTheme),
            fixture.roomIsPrivate,
            fixture.mediaShown,
        );
        expect(toFixture(effective)).toEqual(fixture.expected);
    });

    it("counts the join rules the apps count as private", () => {
        expect(["invite", "knock", "restricted", "knock_restricted"].every(isPrivateJoinRule)).toBe(true);
        expect([undefined, null, "public", "private", "custom"].some(isPrivateJoinRule)).toBe(false);
    });

    it("shows media in private chats only when previews are private", () => {
        expect(isMediaShown("on", false)).toBe(true);
        expect(isMediaShown("off", true)).toBe(false);
        expect(isMediaShown("private", true)).toBe(true);
        expect(isMediaShown("private", false)).toBe(false);
    });
});
