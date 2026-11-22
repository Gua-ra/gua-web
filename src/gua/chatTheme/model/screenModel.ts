/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type BubbleId } from "./bubbles";
import {
    type ChatTheme,
    isStock,
    makeTheme,
    NO_WALLPAPER,
    STOCK,
    themesEqual,
    type Wallpaper,
    withBubbles,
} from "./types";

export type ThemeScreenMode = "chat" | "default";

export interface ThemeScreenState {
    mode: ThemeScreenMode;
    /** The chat's own theme in a chat, else the default. */
    current: ChatTheme;
    defaultTheme: ChatTheme;
    canChange: boolean;
    /** The media setting hides this public chat's photo. Always false for the default. */
    isPhotoHidden: boolean;
}

/** "Default" in a chat, drawn as the user's default; "Classic" for the default itself. Both save STOCK. */
export function firstTileTheme(state: ThemeScreenState): ChatTheme {
    return state.mode === "chat" ? state.defaultTheme : STOCK;
}

export function isFirstTileSelected(state: ThemeScreenState): boolean {
    return isStock(state.current);
}

export function isTileSelected(state: ThemeScreenState, tile: ChatTheme): boolean {
    return themesEqual(tile, state.current);
}

/** What the pickers start from. A chat following the default starts from it without its photo, which stays private. */
export function baseTheme(state: ThemeScreenState): ChatTheme {
    if (state.mode !== "chat" || !isStock(state.current)) return state.current;
    const { defaultTheme } = state;
    return withBubbles(defaultTheme.wallpaper.kind === "photo" ? NO_WALLPAPER : defaultTheme.wallpaper, defaultTheme);
}

export function shownWallpaper(state: ThemeScreenState): Wallpaper {
    const { wallpaper } = baseTheme(state);
    return state.isPhotoHidden && wallpaper.kind === "photo" ? NO_WALLPAPER : wallpaper;
}

/** Saving STOCK makes a chat follow the default, so the preview shows the first tile. */
export function shownTheme(state: ThemeScreenState, saving: ChatTheme): ChatTheme {
    if (isStock(saving)) return firstTileTheme(state);
    return state.isPhotoHidden && saving.wallpaper.kind === "photo" ? withBubbles(NO_WALLPAPER, saving) : saving;
}

export function canSave(state: ThemeScreenState, theme: ChatTheme): boolean {
    return state.canChange && !themesEqual(theme, state.current);
}

/** A picker starts from the base theme, so keeping it is no change either. */
export function canSavePickerChoice(state: ThemeScreenState, theme: ChatTheme): boolean {
    return canSave(state, theme) && !themesEqual(theme, baseTheme(state));
}

export function themeWithBubble(state: ThemeScreenState, bubble: BubbleId): ChatTheme {
    return makeTheme(baseTheme(state).wallpaper, bubble);
}

export function themeWithWallpaper(state: ThemeScreenState, wallpaper: Wallpaper): ChatTheme {
    return withBubbles(wallpaper, baseTheme(state));
}
