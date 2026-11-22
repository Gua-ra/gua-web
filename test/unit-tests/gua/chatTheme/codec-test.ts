/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import fixtures from "./fixtures/chat-background-fixtures.json";
import { decodeChatTheme, encodeChatTheme } from "../../../../src/gua/chatTheme/model/codec";
import { isRemovalContent } from "../../../../src/gua/chatTheme/model/removal";
import { STOCK } from "../../../../src/gua/chatTheme/model/types";
import { type FixtureTheme, fromFixture, toFixture } from "./fixtureForm";

describe("chat theme codec", () => {
    describe("decodes the shared cases", () => {
        it.each(fixtures.cases.map((c) => [c.name, c] as const))("%s", (_name, fixture) => {
            const content = JSON.parse(JSON.stringify(fixture.content));
            expect(toFixture(decodeChatTheme(content))).toEqual(fixture.expected);
        });
    });

    describe("encodes the shared cases byte for byte", () => {
        it.each(fixtures.encode_cases.map((c) => [c.name, c] as const))("%s", (_name, fixture) => {
            const theme = fromFixture(fixture.theme as FixtureTheme);
            expect(JSON.stringify(encodeChatTheme(theme))).toBe(fixture.expected);
        });
    });

    it("reads what it writes", () => {
        for (const fixture of fixtures.encode_cases) {
            const theme = fromFixture(fixture.theme as FixtureTheme);
            expect(decodeChatTheme(JSON.parse(fixture.expected))).toEqual(theme);
        }
    });

    it("rejects a photo whose whole numbers are beyond 64 bits, as iOS does", () => {
        const photo = { url: "mxc://gua.global/AbCdEf", mimetype: "image/jpeg", w: 800, h: 600, size: 1000 };
        expect(decodeChatTheme({ v: 1, kind: "photo", photo: { ...photo, dim: 1e20 } })).toEqual(STOCK);
        expect(decodeChatTheme({ v: 1, kind: "photo", photo: { ...photo, align: { x: -1e20 } } })).toEqual(STOCK);
        const clamped = decodeChatTheme({ v: 1, kind: "photo", photo: { ...photo, dim: 2 ** 60 } });
        expect(clamped.wallpaper.kind === "photo" && clamped.wallpaper.photo.dim).toBe(80);
    });

    it("treats content without keys as a removal", () => {
        expect(isRemovalContent({})).toBe(true);
        expect(isRemovalContent({ v: 1 })).toBe(false);
        expect(isRemovalContent(undefined)).toBe(false);
    });
});
