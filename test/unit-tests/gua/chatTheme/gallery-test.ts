/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { THEME_GALLERY, WALLPAPER_GALLERY } from "../../../../src/gua/chatTheme/model/gallery";
import { artworkTheme, makeTheme, presetTheme, type Wallpaper } from "../../../../src/gua/chatTheme/model/types";

const ids = (wallpapers: Wallpaper[]): string[] =>
    wallpapers.map((w) => (w.kind === "art" ? w.art : w.kind === "preset" ? `preset:${w.preset}` : w.kind));

const section = (id: string): Wallpaper[] => THEME_GALLERY.find((s) => s.id === id)!.themes.map((t) => t.wallpaper);

describe("chat theme gallery", () => {
    it("has the apps' sections in order", () => {
        expect(THEME_GALLERY.map((s) => s.id)).toEqual([
            "featured",
            "live",
            "nature",
            "patterns",
            "minimal",
            "gradients",
        ]);
        expect(WALLPAPER_GALLERY.map((s) => s.id)).toEqual(["live", "nature", "patterns", "minimal", "gradients"]);
    });

    it("features the picked artworks with their bubble pairs", () => {
        expect(ids(section("featured"))).toEqual([
            "silk",
            "glacier-lake",
            "glass-drops",
            "currents",
            "palm-coast",
            "ipe",
            "azulejo",
            "paper",
        ]);
        const featured = THEME_GALLERY[0].themes;
        expect(featured).toContainEqual(makeTheme({ kind: "art", art: "glass-drops" }, "purple", "pink"));
        expect(featured).toContainEqual(makeTheme({ kind: "art", art: "silk" }, "teal"));
    });

    it("holds every artwork in catalog order, with Guará last in Nature", () => {
        expect(ids(section("live"))).toEqual([
            "glass-drops",
            "glass-drops-blue",
            "molten-pearl",
            "silk",
            "ipe",
            "rain-on-glass",
            "pantanal",
            "currents-live",
            "boreal",
            "lagoon",
            "sea-sparks",
            "tropic-dusk",
        ]);
        expect(ids(section("nature"))).toEqual([
            "dune-lagoons",
            "palm-coast",
            "river-bends",
            "highland-mist",
            "glacier-lake",
            "canola-sky",
            "harbour-fog",
            "canyon-glow",
            "polar-ice",
            "moon-tide",
            "guara",
        ]);
        expect(ids(section("patterns"))).toEqual([
            "currents",
            "azulejo",
            "calcadao",
            "knit",
            "doodles-brasil",
            "doodles-canada",
        ]);
        expect(THEME_GALLERY.find((s) => s.id === "nature")!.themes.at(-1)).toEqual(
            makeTheme({ kind: "art", art: "guara" }, "green"),
        );
    });

    it("pairs the minimal and gradient presets with their bubbles", () => {
        expect(THEME_GALLERY.find((s) => s.id === "minimal")!.themes).toEqual([
            artworkTheme("paper"),
            makeTheme({ kind: "art", art: "paper-cut" }, "teal", "orange"),
            presetTheme("mint", "green"),
            presetTheme("sky", "blue"),
            presetTheme("sand", "orange"),
            presetTheme("blush", "pink"),
            presetTheme("lavender", "purple"),
            presetTheme("graphite", "graphite"),
        ]);
        expect(THEME_GALLERY.find((s) => s.id === "gradients")!.themes).toEqual([
            presetTheme("aurora", "teal"),
            presetTheme("sunset", "orange"),
            presetTheme("ocean", "blue"),
            presetTheme("night", "purple"),
            presetTheme("dawn", "pink"),
            presetTheme("forest", "teal"),
            presetTheme("dusk", "purple"),
            presetTheme("citrus", "green"),
        ]);
    });

    it("offers wallpapers without Featured in the wallpaper picker", () => {
        expect(ids(WALLPAPER_GALLERY.find((s) => s.id === "minimal")!.wallpapers)).toEqual([
            "paper",
            "paper-cut",
            "preset:mint",
            "preset:sky",
            "preset:sand",
            "preset:blush",
            "preset:lavender",
            "preset:graphite",
        ]);
        expect(ids(WALLPAPER_GALLERY.find((s) => s.id === "gradients")!.wallpapers)).toEqual([
            "preset:aurora",
            "preset:sunset",
            "preset:ocean",
            "preset:night",
            "preset:dawn",
            "preset:forest",
            "preset:dusk",
            "preset:citrus",
        ]);
        expect(ids(WALLPAPER_GALLERY.find((s) => s.id === "nature")!.wallpapers)).toEqual(ids(section("nature")));
    });
});
