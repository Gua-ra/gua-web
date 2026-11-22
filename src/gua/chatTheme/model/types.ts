/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type ArtworkId, getArtwork } from "./artworks";
import { type BubbleId } from "./bubbles";
import { type PresetId } from "./presets";

/** As on the wire: `dim` in whole percent, `alignX` and `alignY` in thousandths where 0 pins the left or top edge. */
export interface PhotoWallpaper {
    url: string;
    mimetype: string;
    w: number;
    h: number;
    size: number;
    blurhash: string | null;
    dim: number;
    alignX: number;
    alignY: number;
}

export type Wallpaper =
    | { kind: "none" }
    | { kind: "preset"; preset: PresetId }
    | { kind: "art"; art: ArtworkId }
    | { kind: "photo"; photo: PhotoWallpaper };

export interface ChatTheme {
    readonly wallpaper: Wallpaper;
    readonly bubble: BubbleId;
    /** Set only when it and `bubble` are different palette colours. */
    readonly bubbleDark?: BubbleId;
}

export const NO_WALLPAPER: Wallpaper = { kind: "none" };

export function makeTheme(wallpaper: Wallpaper, bubble: BubbleId = "standard", bubbleDark?: BubbleId): ChatTheme {
    const keepsDark =
        bubble !== "standard" && bubbleDark !== undefined && bubbleDark !== "standard" && bubbleDark !== bubble;
    return keepsDark ? { wallpaper, bubble, bubbleDark } : { wallpaper, bubble };
}

/** No theme: no wallpaper and the stock bubble. */
export const STOCK: ChatTheme = makeTheme(NO_WALLPAPER);

export function wallpapersEqual(a: Wallpaper, b: Wallpaper): boolean {
    switch (a.kind) {
        case "none":
            return b.kind === "none";
        case "preset":
            return b.kind === "preset" && a.preset === b.preset;
        case "art":
            return b.kind === "art" && a.art === b.art;
        case "photo":
            return (
                b.kind === "photo" &&
                (Object.keys(a.photo) as (keyof PhotoWallpaper)[]).every((key) => a.photo[key] === b.photo[key])
            );
    }
}

export function themesEqual(a: ChatTheme, b: ChatTheme): boolean {
    return a.bubble === b.bubble && a.bubbleDark === b.bubbleDark && wallpapersEqual(a.wallpaper, b.wallpaper);
}

export function isStock(theme: ChatTheme): boolean {
    return themesEqual(theme, STOCK);
}

export function shownBubble(theme: ChatTheme, dark: boolean): BubbleId {
    return dark ? (theme.bubbleDark ?? theme.bubble) : theme.bubble;
}

export function withBubbles(wallpaper: Wallpaper, bubbles: ChatTheme): ChatTheme {
    return makeTheme(wallpaper, bubbles.bubble, bubbles.bubbleDark);
}

export function artworkTheme(id: ArtworkId): ChatTheme {
    const artwork = getArtwork(id);
    return makeTheme({ kind: "art", art: id }, artwork.bubble, artwork.bubbleDark);
}

export function presetTheme(preset: PresetId, bubble: BubbleId): ChatTheme {
    return makeTheme({ kind: "preset", preset }, bubble);
}
