/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type ArtworkId, type ArtworkSection, artworksIn } from "./artworks";
import { type BubbleId } from "./bubbles";
import { GRADIENTS, type PresetId, SOLIDS } from "./presets";
import { artworkTheme, type ChatTheme, presetTheme, type Wallpaper } from "./types";

export type GallerySectionId = "featured" | "live" | "nature" | "patterns" | "minimal" | "gradients";

export interface ThemeGallerySection {
    id: GallerySectionId;
    themes: ChatTheme[];
}

export interface WallpaperGallerySection {
    id: GallerySectionId;
    wallpapers: Wallpaper[];
}

const FEATURED: ArtworkId[] = [
    "silk",
    "glacier-lake",
    "glass-drops",
    "currents",
    "palm-coast",
    "ipe",
    "azulejo",
    "paper",
];

const SOLID_BUBBLES: [PresetId, BubbleId][] = [
    ["mint", "green"],
    ["sky", "blue"],
    ["sand", "orange"],
    ["blush", "pink"],
    ["lavender", "purple"],
    ["graphite", "graphite"],
];

const GRADIENT_BUBBLES: [PresetId, BubbleId][] = [
    ["aurora", "teal"],
    ["sunset", "orange"],
    ["ocean", "blue"],
    ["night", "purple"],
    ["dawn", "pink"],
    ["forest", "teal"],
    ["dusk", "purple"],
    ["citrus", "green"],
];

const artworkThemes = (section: ArtworkSection): ChatTheme[] =>
    artworksIn(section).map((artwork) => artworkTheme(artwork.id));

/** The screen puts its first tile, not listed here, at the start of Featured. */
export const THEME_GALLERY: ThemeGallerySection[] = [
    { id: "featured", themes: FEATURED.map(artworkTheme) },
    { id: "live", themes: artworkThemes("live") },
    { id: "nature", themes: artworkThemes("nature") },
    { id: "patterns", themes: artworkThemes("patterns") },
    {
        id: "minimal",
        themes: [...artworkThemes("minimal"), ...SOLID_BUBBLES.map(([preset, bubble]) => presetTheme(preset, bubble))],
    },
    { id: "gradients", themes: GRADIENT_BUBBLES.map(([preset, bubble]) => presetTheme(preset, bubble)) },
];

const artworkWallpapers = (section: ArtworkSection): Wallpaper[] =>
    artworksIn(section).map((artwork) => ({ kind: "art", art: artwork.id }));

const presetWallpapers = (presets: readonly PresetId[]): Wallpaper[] =>
    presets.map((preset) => ({ kind: "preset", preset }));

export const WALLPAPER_GALLERY: WallpaperGallerySection[] = [
    { id: "live", wallpapers: artworkWallpapers("live") },
    { id: "nature", wallpapers: artworkWallpapers("nature") },
    { id: "patterns", wallpapers: artworkWallpapers("patterns") },
    { id: "minimal", wallpapers: [...artworkWallpapers("minimal"), ...presetWallpapers(SOLIDS)] },
    { id: "gradients", wallpapers: presetWallpapers(GRADIENTS) },
];
