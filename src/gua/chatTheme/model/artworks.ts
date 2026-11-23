/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type BubbleId } from "./bubbles";
import { PHOTO_DEFAULT_DIM } from "./constants";
import { type PresetId } from "./presets";

export type ArtworkSection = "live" | "nature" | "photos" | "patterns" | "minimal";

/** Each photo licence's deed, which the credits link to. */
export const PHOTO_LICENCE_URLS = {
    "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
} as const;

export type PhotoLicence = keyof typeof PHOTO_LICENCE_URLS;

/** Must match the credit in `res/img/gua/wallpapers/manifest.json`. */
export interface PhotoCredit {
    readonly author: string;
    readonly licence: PhotoLicence;
    readonly sourceUrl?: string;
}

interface ArtworkDefinition {
    readonly id: string;
    readonly section: ArtworkSection;
    readonly bubble: BubbleId;
    readonly bubbleDark?: BubbleId;
    /** The point of the image that stays on screen when it is cropped. */
    readonly anchor: { readonly x: number; readonly y: number };
    /** Shown by builds that don't know the artwork. It goes on the wire, so it never changes once shipped. */
    readonly fallback: PresetId;
    /** Shader time of the still; a live artwork starts here so its first frame matches. */
    readonly stillTime?: number;
    /** Set exactly for photos, which must show it wherever they are offered. */
    readonly credit?: PhotoCredit;
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
    {
        id: "photo-lencois-lagoon",
        section: "photos",
        bubble: "teal",
        bubbleDark: "purple",
        anchor: { x: 0.5, y: 0.52 },
        fallback: "sky",
        credit: {
            author: "Gerda Arendt",
            licence: "CC0 1.0",
            sourceUrl:
                "https://commons.wikimedia.org/wiki/File:Lagoon_in_curved_sanddunes%2C_Len%C3%A7%C3%B3is_Maranhenses.jpg",
        },
    },
    {
        id: "photo-lencois-dunes",
        section: "photos",
        bubble: "blue",
        bubbleDark: "purple",
        anchor: { x: 0.35, y: 0.46 },
        fallback: "graphite",
        credit: {
            author: "Gerda Arendt",
            licence: "CC0 1.0",
            sourceUrl:
                "https://commons.wikimedia.org/wiki/File:Sand_dunes_before_sunset%2C_Len%C3%A7%C3%B3is_Maranhenses.jpg",
        },
    },
    {
        id: "photo-gruta-azul",
        section: "photos",
        bubble: "teal",
        bubbleDark: "blue",
        anchor: { x: 0.65, y: 0.68 },
        fallback: "sky",
        credit: {
            author: "Wilfredo Rodriguez (Wilfredor)",
            licence: "CC0 1.0",
            sourceUrl:
                "https://commons.wikimedia.org/wiki/File:Rock_walls_and_entrance_of_Gruta_Azul%2C_Arraial_do_Cabo%2C_Brazil.jpg",
        },
    },
    {
        id: "photo-ipe",
        section: "photos",
        bubble: "blue",
        bubbleDark: "orange",
        anchor: { x: 0.47, y: 0.28 },
        fallback: "graphite",
        credit: {
            author: "Thyrome",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Handroanthus_ochraceus.jpg",
        },
    },
    {
        id: "photo-araucaria",
        section: "photos",
        bubble: "green",
        bubbleDark: "teal",
        anchor: { x: 0.45, y: 0.42 },
        fallback: "sky",
        credit: {
            author: "Themium",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Arauc%C3%A1ria_jordanense_1.jpg",
        },
    },
    {
        id: "photo-maned-wolf",
        section: "photos",
        bubble: "blue",
        bubbleDark: "purple",
        anchor: { x: 0.38, y: 0.55 },
        fallback: "sand",
        credit: {
            author: "Wilfredo Rodriguez (Wilfredor)",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Chrysocyon_brachyurus_in_S%C3%A3o_Paulo_Zoo.jpg",
        },
    },
    {
        id: "photo-maned-wolf-standing",
        section: "photos",
        bubble: "blue",
        bubbleDark: "purple",
        anchor: { x: 0.72, y: 0.25 },
        fallback: "mint",
        credit: {
            author: "Gil Myers, Smithsonian's National Zoo",
            licence: "CC0 1.0",
            sourceUrl: "https://nationalzoo.si.edu/object/nzp_NZP-20160729-011GM",
        },
    },
    {
        id: "photo-yukon-trail",
        section: "photos",
        bubble: "blue",
        bubbleDark: "teal",
        anchor: { x: 0.45, y: 0.55 },
        fallback: "sky",
        credit: { author: "Sarah Lacerda", licence: "CC BY 4.0" },
    },
    {
        id: "photo-yukon-sun",
        section: "photos",
        bubble: "orange",
        bubbleDark: "blue",
        anchor: { x: 0.5, y: 0.72 },
        fallback: "sky",
        credit: { author: "Sarah Lacerda", licence: "CC BY 4.0" },
    },
    {
        id: "photo-yukon-forest",
        section: "photos",
        bubble: "green",
        bubbleDark: "teal",
        anchor: { x: 0.53, y: 0.68 },
        fallback: "sky",
        credit: { author: "Sarah Lacerda", licence: "CC BY 4.0" },
    },
    {
        id: "photo-yukon-sled",
        section: "photos",
        bubble: "purple",
        bubbleDark: "blue",
        anchor: { x: 0.5, y: 0.62 },
        fallback: "sky",
        credit: { author: "Sarah Lacerda", licence: "CC BY 4.0" },
    },
    {
        id: "photo-yukon-sled-2",
        section: "photos",
        bubble: "teal",
        bubbleDark: "purple",
        anchor: { x: 0.5, y: 0.7 },
        fallback: "sky",
        credit: { author: "Sarah Lacerda", licence: "CC BY 4.0" },
    },
    {
        id: "photo-peyto-lake",
        section: "photos",
        bubble: "teal",
        bubbleDark: "blue",
        anchor: { x: 0.4, y: 0.6 },
        fallback: "ocean",
        credit: {
            author: "Ezra Jeffrey-Comeau",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Highest_Highs_(Unsplash).jpg",
        },
    },
    {
        id: "photo-lone-canoe",
        section: "photos",
        bubble: "orange",
        bubbleDark: "purple",
        anchor: { x: 0.48, y: 0.62 },
        fallback: "ocean",
        credit: {
            author: "Braxton Stuntz",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Lone_Canoe_(Unsplash).jpg",
        },
    },
    {
        id: "photo-jasper-aurora",
        section: "photos",
        bubble: "green",
        bubbleDark: "teal",
        anchor: { x: 0.5, y: 0.55 },
        fallback: "sky",
        credit: {
            author: "Priscilla Du Preez",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Northern_lights_over_a_lake_(Unsplash).jpg",
        },
    },
    {
        id: "photo-nunavik-aurora",
        section: "photos",
        bubble: "purple",
        bubbleDark: "pink",
        anchor: { x: 0.5, y: 0.4 },
        fallback: "mint",
        credit: {
            author: "Nicolas M. Perrault",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Aurora_Borealis_in_Kangiqsualujjaq.tif",
        },
    },
    {
        id: "photo-lac-delage",
        section: "photos",
        bubble: "blue",
        anchor: { x: 0.5, y: 0.35 },
        fallback: "sand",
        credit: {
            author: "Wilfredo Rodriguez (Wilfredor)",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Lac_Delage_at_night,_Quebec,_Canada.jpg",
        },
    },
    {
        id: "photo-quebec-ice",
        section: "photos",
        bubble: "green",
        bubbleDark: "teal",
        anchor: { x: 0.47, y: 0.7 },
        fallback: "sand",
        credit: {
            author: "Wilfredo Rodriguez (Wilfredor)",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Ice_on_a_branch_in_Quebec_City.jpg",
        },
    },
    {
        id: "photo-quebec-leaves",
        section: "photos",
        bubble: "teal",
        bubbleDark: "graphite",
        anchor: { x: 0.5, y: 0.5 },
        fallback: "sand",
        credit: {
            author: "Wilfredo Rodriguez (Wilfredor)",
            licence: "CC0 1.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Autumn_leaves_on_the_ground_in_Quebec_City.jpg",
        },
    },
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

export function findArtwork(id: unknown): Artwork | undefined {
    return typeof id === "string" ? BY_ID.get(id) : undefined;
}

export function getArtwork(id: ArtworkId): Artwork {
    return BY_ID.get(id)!;
}

export function isLive(artwork: Artwork): boolean {
    return artwork.section === "live";
}

/** A photo has one image for both appearances, so dark mode dims it like a user's own photo. */
export function darkDim(artwork: Artwork): number | undefined {
    return artwork.credit ? PHOTO_DEFAULT_DIM : undefined;
}

export function artworksIn(section: ArtworkSection): Artwork[] {
    return ARTWORKS.filter((artwork) => artwork.section === section);
}

export function photoCredits(): { id: ArtworkId; credit: PhotoCredit }[] {
    return artworksIn("photos").flatMap(({ id, credit }) => (credit ? [{ id, credit }] : []));
}
