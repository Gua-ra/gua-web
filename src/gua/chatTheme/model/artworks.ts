/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type BubbleId } from "./bubbles";
import { type PresetId } from "./presets";

export const ARTWORK_SECTIONS = ["live", "nature", "patterns", "minimal"] as const;

export type ArtworkSection = (typeof ARTWORK_SECTIONS)[number];

interface ArtworkDefinition {
    readonly id: string;
    readonly section: ArtworkSection;
    readonly bubble: BubbleId;
    readonly bubbleDark?: BubbleId;
    /** The point of the image that stays on screen when it is cropped. */
    readonly anchor: { readonly x: number; readonly y: number };
    /** What builds that don't know the artwork show instead: written with it, and never changed once shipped. */
    readonly fallback: PresetId;
    /** The shader time the still was rendered at, where a live artwork starts so its first frame is the still. */
    readonly stillTime?: number;
}

/** In gallery order, which must match `res/img/gua/wallpapers/manifest.json`. Ids go on the wire and never change. */
export const ARTWORKS = [
    {
        id: "glass-drops",
        section: "live",
        bubble: "purple",
        bubbleDark: "pink",
        anchor: { x: 0.5, y: 0.08 },
        fallback: "blush",
        stillTime: 0,
    },
    {
        id: "glass-drops-blue",
        section: "live",
        bubble: "teal",
        anchor: { x: 0.5, y: 0.35 },
        fallback: "sky",
        stillTime: 14,
    },
    {
        id: "molten-pearl",
        section: "live",
        bubble: "purple",
        bubbleDark: "blue",
        anchor: { x: 0.5, y: 0.5 },
        fallback: "sky",
        stillTime: 24,
    },
    { id: "silk", section: "live", bubble: "teal", anchor: { x: 0.5, y: 0.5 }, fallback: "mint", stillTime: 0 },
    {
        id: "ipe",
        section: "live",
        bubble: "pink",
        bubbleDark: "yellow",
        anchor: { x: 0.5, y: 0 },
        fallback: "sunset",
        stillTime: 24,
    },
    {
        id: "rain-on-glass",
        section: "live",
        bubble: "green",
        bubbleDark: "blue",
        anchor: { x: 0.5, y: 0.3 },
        fallback: "aurora",
        stillTime: 48,
    },
    { id: "pantanal", section: "live", bubble: "green", anchor: { x: 0.5, y: 0.38 }, fallback: "mint", stillTime: 24 },
    {
        id: "currents-live",
        section: "live",
        bubble: "purple",
        anchor: { x: 0.5, y: 0.5 },
        fallback: "lavender",
        stillTime: 24,
    },
    {
        id: "boreal",
        section: "live",
        bubble: "blue",
        bubbleDark: "green",
        anchor: { x: 0.5, y: 0.3 },
        fallback: "graphite",
        stillTime: 151,
    },
    {
        id: "lagoon",
        section: "live",
        bubble: "blue",
        bubbleDark: "teal",
        anchor: { x: 0.5, y: 0.5 },
        fallback: "mint",
        stillTime: 36,
    },
    {
        id: "sea-sparks",
        section: "live",
        bubble: "blue",
        bubbleDark: "teal",
        anchor: { x: 0.5, y: 0.3 },
        fallback: "aurora",
        stillTime: 0,
    },
    {
        id: "tropic-dusk",
        section: "live",
        bubble: "pink",
        bubbleDark: "orange",
        anchor: { x: 0.5, y: 0.35 },
        fallback: "sunset",
        stillTime: 24,
    },
    {
        id: "dune-lagoons",
        section: "nature",
        bubble: "teal",
        bubbleDark: "purple",
        anchor: { x: 0.5, y: 0.25 },
        fallback: "mint",
    },
    {
        id: "palm-coast",
        section: "nature",
        bubble: "orange",
        bubbleDark: "blue",
        anchor: { x: 0.5, y: 0.2 },
        fallback: "ocean",
    },
    { id: "river-bends", section: "nature", bubble: "teal", anchor: { x: 0.5, y: 0.5 }, fallback: "mint" },
    {
        id: "highland-mist",
        section: "nature",
        bubble: "blue",
        bubbleDark: "green",
        anchor: { x: 0.5, y: 0.3 },
        fallback: "mint",
    },
    { id: "glacier-lake", section: "nature", bubble: "teal", anchor: { x: 0.5, y: 0.35 }, fallback: "ocean" },
    {
        id: "canola-sky",
        section: "nature",
        bubble: "green",
        bubbleDark: "orange",
        anchor: { x: 0.4, y: 0.38 },
        fallback: "sand",
    },
    { id: "harbour-fog", section: "nature", bubble: "blue", anchor: { x: 0.7, y: 0.3 }, fallback: "ocean" },
    {
        id: "canyon-glow",
        section: "nature",
        bubble: "blue",
        bubbleDark: "purple",
        anchor: { x: 0.5, y: 0.3 },
        fallback: "sand",
    },
    {
        id: "polar-ice",
        section: "nature",
        bubble: "blue",
        bubbleDark: "purple",
        anchor: { x: 0.5, y: 0.3 },
        fallback: "night",
    },
    { id: "moon-tide", section: "nature", bubble: "blue", anchor: { x: 0.5, y: 0.72 }, fallback: "ocean" },
    { id: "guara", section: "nature", bubble: "green", anchor: { x: 0.78, y: 0.19 }, fallback: "mint" },
    { id: "currents", section: "patterns", bubble: "purple", anchor: { x: 0.5, y: 0.5 }, fallback: "lavender" },
    { id: "azulejo", section: "patterns", bubble: "blue", anchor: { x: 0.5, y: 0.5 }, fallback: "sky" },
    { id: "calcadao", section: "patterns", bubble: "teal", anchor: { x: 0.5, y: 0.5 }, fallback: "sand" },
    { id: "knit", section: "patterns", bubble: "blue", anchor: { x: 0.5, y: 0 }, fallback: "sand" },
    { id: "doodles-brasil", section: "patterns", bubble: "green", anchor: { x: 0.5, y: 0.5 }, fallback: "mint" },
    { id: "doodles-canada", section: "patterns", bubble: "blue", anchor: { x: 0.5, y: 0.5 }, fallback: "sand" },
    { id: "paper", section: "minimal", bubble: "green", anchor: { x: 0.5, y: 0.5 }, fallback: "sand" },
    {
        id: "paper-cut",
        section: "minimal",
        bubble: "teal",
        bubbleDark: "orange",
        anchor: { x: 1, y: 0 },
        fallback: "sand",
    },
] as const satisfies readonly ArtworkDefinition[];

export type ArtworkId = (typeof ARTWORKS)[number]["id"];

export type Artwork = ArtworkDefinition & { readonly id: ArtworkId };

const BY_ID = new Map<string, Artwork>(ARTWORKS.map((artwork) => [artwork.id, artwork]));

/** Ids are exact and case-sensitive. */
export function findArtwork(id: unknown): Artwork | undefined {
    return typeof id === "string" ? BY_ID.get(id) : undefined;
}

export function getArtwork(id: ArtworkId): Artwork {
    return BY_ID.get(id)!;
}

export function isLive(artwork: Artwork): boolean {
    return artwork.section === "live";
}

export function artworksIn(section: ArtworkSection): Artwork[] {
    return ARTWORKS.filter((artwork) => artwork.section === section);
}
