/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { stickerSections } from "../../../../src/gua/expressions/stickerSections";
import { type StickerPack } from "../../../../src/gua/expressions/stickerPacks";

const cat = { url: "mxc://gua.global/cat", body: "Gato feliz" };
const dog = { url: "mxc://gua.global/dog", body: "Dog" };
const fox = { url: "mxc://gua.global/fox", body: "Fox" };

const pack: StickerPack = {
    eventType: "m.room.image_pack",
    stateKey: "animals",
    displayName: "Animals",
    stickers: [{ shortcode: "élan", image: { url: "mxc://gua.global/elk", body: "Elk" } }],
};

describe("stickerSections", () => {
    it("always shows Recent and hides the other empty sections", () => {
        const sections = stickerSections([], { favourites: [], stickers: [] }, [], "");
        expect(sections.map((section) => section.id)).toEqual(["recent"]);
    });

    it("orders Recent, Favourites, My stickers, then packs", () => {
        const sections = stickerSections(
            [cat],
            { favourites: [dog], stickers: [{ shortcode: "s1", image: fox, addedAt: 1 }] },
            [pack],
            "",
        );
        expect(sections.map((section) => section.id)).toEqual([
            "recent",
            "favourites",
            "mine",
            "pack:m.room.image_pack:animals",
        ]);
        expect(sections[2].tiles).toEqual([{ image: fox, shortcode: "s1" }]);
        expect(sections[3].pack).toBe(pack);
        expect(sections[3].tiles).toEqual([{ image: pack.stickers[0].image }]);
    });

    it("filters every section by body and shortcode, ignoring case and accents", () => {
        const library = { favourites: [dog], stickers: [{ shortcode: "s1", image: fox }] };
        expect(stickerSections([cat], library, [pack], "GATO").map((section) => section.id)).toEqual(["recent"]);
        const byShortcode = stickerSections([cat], library, [pack], " elan ");
        expect(byShortcode.map((section) => [section.id, section.tiles.length])).toEqual([
            ["recent", 0],
            ["pack:m.room.image_pack:animals", 1],
        ]);
    });
});
