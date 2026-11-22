/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { _t, _td, type TranslationKey } from "../../../languageHandler";
import { type ArtworkId } from "./artworks";
import { type BubbleId } from "./bubbles";
import { type GallerySectionId } from "./gallery";
import { type PresetId } from "./presets";
import { type ChatTheme, isStock, shownBubble, type Wallpaper } from "./types";

export const BUBBLE_NAMES: Record<BubbleId, TranslationKey> = {
    standard: _td("gua|chat_theme|bubble|standard"),
    green: _td("gua|chat_theme|bubble|green"),
    teal: _td("gua|chat_theme|bubble|teal"),
    blue: _td("gua|chat_theme|bubble|blue"),
    purple: _td("gua|chat_theme|bubble|purple"),
    pink: _td("gua|chat_theme|bubble|pink"),
    orange: _td("gua|chat_theme|bubble|orange"),
    yellow: _td("gua|chat_theme|bubble|yellow"),
    graphite: _td("gua|chat_theme|bubble|graphite"),
};

export const PRESET_NAMES: Record<PresetId, TranslationKey> = {
    aurora: _td("gua|chat_theme|preset|aurora"),
    mint: _td("gua|chat_theme|preset|mint"),
    sky: _td("gua|chat_theme|preset|sky"),
    sand: _td("gua|chat_theme|preset|sand"),
    blush: _td("gua|chat_theme|preset|blush"),
    lavender: _td("gua|chat_theme|preset|lavender"),
    graphite: _td("gua|chat_theme|preset|graphite"),
    sunset: _td("gua|chat_theme|preset|sunset"),
    ocean: _td("gua|chat_theme|preset|ocean"),
    night: _td("gua|chat_theme|preset|night"),
    dawn: _td("gua|chat_theme|preset|dawn"),
    forest: _td("gua|chat_theme|preset|forest"),
    dusk: _td("gua|chat_theme|preset|dusk"),
    citrus: _td("gua|chat_theme|preset|citrus"),
};

export const ARTWORK_NAMES: Record<ArtworkId, TranslationKey> = {
    "glass-drops": _td("gua|chat_theme|art|glass_drops"),
    "glass-drops-blue": _td("gua|chat_theme|art|glass_drops_blue"),
    "molten-pearl": _td("gua|chat_theme|art|molten_pearl"),
    "silk": _td("gua|chat_theme|art|silk"),
    "ipe": _td("gua|chat_theme|art|ipe"),
    "rain-on-glass": _td("gua|chat_theme|art|rain_on_glass"),
    "pantanal": _td("gua|chat_theme|art|pantanal"),
    "currents-live": _td("gua|chat_theme|art|currents_live"),
    "boreal": _td("gua|chat_theme|art|boreal"),
    "lagoon": _td("gua|chat_theme|art|lagoon"),
    "sea-sparks": _td("gua|chat_theme|art|sea_sparks"),
    "tropic-dusk": _td("gua|chat_theme|art|tropic_dusk"),
    "dune-lagoons": _td("gua|chat_theme|art|dune_lagoons"),
    "palm-coast": _td("gua|chat_theme|art|palm_coast"),
    "river-bends": _td("gua|chat_theme|art|river_bends"),
    "highland-mist": _td("gua|chat_theme|art|highland_mist"),
    "glacier-lake": _td("gua|chat_theme|art|glacier_lake"),
    "canola-sky": _td("gua|chat_theme|art|canola_sky"),
    "harbour-fog": _td("gua|chat_theme|art|harbour_fog"),
    "canyon-glow": _td("gua|chat_theme|art|canyon_glow"),
    "polar-ice": _td("gua|chat_theme|art|polar_ice"),
    "moon-tide": _td("gua|chat_theme|art|moon_tide"),
    "guara": _td("gua|chat_theme|art|guara"),
    "currents": _td("gua|chat_theme|art|currents"),
    "azulejo": _td("gua|chat_theme|art|azulejo"),
    "calcadao": _td("gua|chat_theme|art|calcadao"),
    "knit": _td("gua|chat_theme|art|knit"),
    "doodles-brasil": _td("gua|chat_theme|art|doodles_brasil"),
    "doodles-canada": _td("gua|chat_theme|art|doodles_canada"),
    "paper": _td("gua|chat_theme|art|paper"),
    "paper-cut": _td("gua|chat_theme|art|paper_cut"),
};

export const SECTION_NAMES: Record<GallerySectionId, TranslationKey> = {
    featured: _td("gua|chat_theme|section|featured"),
    live: _td("gua|chat_theme|section|live"),
    nature: _td("gua|chat_theme|section|nature"),
    patterns: _td("gua|chat_theme|section|patterns"),
    minimal: _td("gua|chat_theme|section|minimal"),
    gradients: _td("gua|chat_theme|section|gradients"),
};

export function wallpaperName(wallpaper: Wallpaper): string {
    switch (wallpaper.kind) {
        case "none":
            return _t("gua|chat_theme|no_wallpaper");
        case "preset":
            return _t(PRESET_NAMES[wallpaper.preset]);
        case "art":
            return _t(ARTWORK_NAMES[wallpaper.art]);
        case "photo":
            return _t("gua|chat_theme|photo_value");
    }
}

export function bubbleName(theme: ChatTheme, dark: boolean): string {
    return _t(BUBBLE_NAMES[shownBubble(theme, dark)]);
}

/** A theme without a wallpaper is named after the bubble it shows in the current appearance. */
export function themeName(theme: ChatTheme, dark: boolean): string {
    if (theme.wallpaper.kind !== "none") return wallpaperName(theme.wallpaper);
    return isStock(theme) ? _t("gua|chat_theme|default_tile") : bubbleName(theme, dark);
}
