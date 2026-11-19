/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { searchKey, type StickerImage } from "./StickerImage";
import { type StickerLibrary } from "./stickerLibrary";
import { type StickerPack } from "./stickerPacks";

export type StickerSectionKind = "recent" | "favourites" | "mine" | "pack";

export interface StickerTile {
    image: StickerImage;
    /** Set in My stickers only, where it names the sticker to delete. */
    shortcode?: string;
}

export interface StickerSection {
    id: string;
    kind: StickerSectionKind;
    /** The pack's name and avatar, for pack sections. */
    pack?: StickerPack;
    tiles: StickerTile[];
}

/**
 * Recent always shows, for its Create sticker tile; the other sections show only with stickers in
 * them. A query filters every section by body and shortcode, ignoring case and accents.
 */
export function stickerSections(
    recents: StickerImage[],
    library: StickerLibrary,
    packs: StickerPack[],
    query: string,
): StickerSection[] {
    const key = searchKey(query.trim());
    const matches = (image: StickerImage, shortcode?: string): boolean =>
        !key || [image.body, shortcode].some((text) => !!text && searchKey(text).includes(key));

    const recent: StickerSection = {
        id: "recent",
        kind: "recent",
        tiles: recents.filter((image) => matches(image)).map((image) => ({ image })),
    };
    const others: StickerSection[] = [
        {
            id: "favourites",
            kind: "favourites",
            tiles: library.favourites.filter((image) => matches(image)).map((image) => ({ image })),
        },
        {
            id: "mine",
            kind: "mine",
            tiles: library.stickers
                .filter(({ image, shortcode }) => matches(image, shortcode))
                .map(({ image, shortcode }) => ({ image, shortcode })),
        },
        ...packs.map(
            (pack): StickerSection => ({
                id: `pack:${pack.eventType}:${pack.stateKey}`,
                kind: "pack",
                pack,
                tiles: pack.stickers
                    .filter(({ image, shortcode }) => matches(image, shortcode))
                    .map(({ image }) => ({ image })),
            }),
        ),
    ];
    return [recent, ...others.filter((section) => section.tiles.length > 0)];
}
