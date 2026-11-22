/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    baseTheme,
    canSave,
    canSavePickerChoice,
    firstTileTheme,
    isFirstTileSelected,
    isTileSelected,
    shownTheme,
    shownWallpaper,
    themeWithBubble,
    themeWithWallpaper,
    type ThemeScreenState,
} from "../../../../src/gua/chatTheme/model/screenModel";
import {
    artworkTheme,
    type ChatTheme,
    makeTheme,
    type PhotoWallpaper,
    presetTheme,
    STOCK,
} from "../../../../src/gua/chatTheme/model/types";

const photo: PhotoWallpaper = {
    url: "mxc://gua.global/AbCdEf",
    mimetype: "image/jpeg",
    w: 1536,
    h: 2048,
    size: 412337,
    blurhash: null,
    dim: 35,
    alignX: 500,
    alignY: 500,
};

function chat(
    current: ChatTheme,
    defaultTheme: ChatTheme = STOCK,
    extra: Partial<ThemeScreenState> = {},
): ThemeScreenState {
    return { mode: "chat", current, defaultTheme, canChange: true, isPhotoHidden: false, ...extra };
}

function personalDefault(current: ChatTheme): ThemeScreenState {
    return { mode: "default", current, defaultTheme: current, canChange: true, isPhotoHidden: false };
}

describe("chat theme screen model", () => {
    it("draws the chat's first tile as the default and the default's first tile as stock", () => {
        const aurora = presetTheme("aurora", "green");
        expect(firstTileTheme(chat(presetTheme("ocean", "teal"), aurora))).toEqual(aurora);
        expect(firstTileTheme(personalDefault(aurora))).toEqual(STOCK);
    });

    it("selects the first tile only when there is no theme", () => {
        expect(isFirstTileSelected(chat(STOCK, presetTheme("aurora", "green")))).toBe(true);
        expect(isFirstTileSelected(chat(presetTheme("aurora", "green")))).toBe(false);
        expect(isFirstTileSelected(personalDefault(STOCK))).toBe(true);
    });

    it("selects an artwork tile only with its bubble pair", () => {
        const state = chat(makeTheme({ kind: "art", art: "glass-drops" }, "purple"));
        expect(isTileSelected(state, artworkTheme("glass-drops"))).toBe(false);
        expect(isTileSelected(chat(artworkTheme("glass-drops")), artworkTheme("glass-drops"))).toBe(true);
    });

    it("never sets the current theme again", () => {
        const theme = presetTheme("ocean", "teal");
        expect(canSave(chat(theme), theme)).toBe(false);
        expect(canSave(chat(theme), presetTheme("ocean", "blue"))).toBe(true);
    });

    it("saves nothing without permission", () => {
        const state = chat(presetTheme("ocean", "teal"), STOCK, { canChange: false });
        expect(canSave(state, STOCK)).toBe(false);
        expect(canSavePickerChoice(state, presetTheme("dawn", "pink"))).toBe(false);
    });

    it("keeps the wallpaper and clears the dark bubble when a bubble is picked", () => {
        const state = chat(artworkTheme("glass-drops"));
        expect(themeWithBubble(state, "green")).toEqual(makeTheme({ kind: "art", art: "glass-drops" }, "green"));
    });

    it("keeps the bubble pair when a wallpaper is picked", () => {
        const state = chat(artworkTheme("glass-drops"));
        expect(themeWithWallpaper(state, { kind: "preset", preset: "dusk" })).toEqual(
            makeTheme({ kind: "preset", preset: "dusk" }, "purple", "pink"),
        );
        expect(themeWithWallpaper(state, { kind: "none" })).toEqual(makeTheme({ kind: "none" }, "purple", "pink"));
    });

    it("starts the pickers of a chat that follows a default from the default without its photo", () => {
        const artworkDefault = artworkTheme("ipe");
        expect(baseTheme(chat(STOCK, artworkDefault))).toEqual(artworkDefault);
        const photoDefault = makeTheme({ kind: "photo", photo }, "orange");
        expect(baseTheme(chat(STOCK, photoDefault))).toEqual(makeTheme({ kind: "none" }, "orange"));
        expect(themeWithWallpaper(chat(STOCK, photoDefault), { kind: "preset", preset: "sky" })).toEqual(
            presetTheme("sky", "orange"),
        );
    });

    it("sends nothing for a picker choice that keeps what the picker starts from", () => {
        const state = chat(STOCK, presetTheme("dusk", "orange"));
        expect(canSavePickerChoice(state, themeWithBubble(state, "orange"))).toBe(false);
        expect(canSavePickerChoice(state, themeWithBubble(state, "teal"))).toBe(true);
        expect(canSavePickerChoice(chat(STOCK), themeWithBubble(chat(STOCK), "standard"))).toBe(false);
    });

    it("removes the theme when the standard bubble leaves no wallpaper", () => {
        const state = chat(makeTheme({ kind: "none" }, "blue"));
        const choice = themeWithBubble(state, "standard");
        expect(choice).toEqual(STOCK);
        expect(canSavePickerChoice(state, choice)).toBe(true);
    });

    it("previews the default for a choice that clears the chat theme", () => {
        const aurora = presetTheme("aurora", "green");
        const state = chat(makeTheme({ kind: "none" }, "blue"), aurora);
        expect(shownTheme(state, themeWithBubble(state, "standard"))).toEqual(aurora);
        expect(shownTheme(personalDefault(aurora), STOCK)).toEqual(STOCK);
    });

    it("hides a chat photo only where the chat hides it", () => {
        const theme = makeTheme({ kind: "photo", photo }, "orange");
        const hidden = chat(theme, STOCK, { isPhotoHidden: true });
        expect(shownTheme(hidden, theme)).toEqual(makeTheme({ kind: "none" }, "orange"));
        expect(shownWallpaper(hidden)).toEqual({ kind: "none" });
        expect(shownTheme(chat(theme), theme)).toEqual(theme);
        expect(shownWallpaper(chat(theme))).toEqual({ kind: "photo", photo });
        const artwork = artworkTheme("silk");
        expect(shownTheme(chat(artwork, STOCK, { isPhotoHidden: true }), artwork)).toEqual(artwork);
    });
});
