/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { isJsonObject, type JsonObject, stringField } from "./StickerImage";
import { arrayField, withVersion } from "./stickerLibrary";

export const GIF_LIBRARY_EVENT_TYPE = "global.gua.gifs";
export const KLIPY = "klipy";
const MAX_FAVOURITES = 50;

export interface GifFavourite {
    id: string;
    provider: string;
}

export function decodeGifFavourites(content: JsonObject): GifFavourite[] {
    return arrayField(content, "favourites").flatMap((value) => {
        const favourite = toFavourite(value);
        return favourite ? [favourite] : [];
    });
}

export function favouriteGif(content: JsonObject, id: string, provider = KLIPY, limit = MAX_FAVOURITES): JsonObject {
    const others = arrayField(content, "favourites").filter((value) => !isFavourite(value, id, provider));
    return withVersion({ ...content, favourites: [{ id, p: provider }, ...others].slice(0, limit) });
}

export function unfavouriteGif(content: JsonObject, id: string, provider = KLIPY): JsonObject {
    if (!Array.isArray(content.favourites)) return withVersion(content);
    return withVersion({
        ...content,
        favourites: content.favourites.filter((value) => !isFavourite(value, id, provider)),
    });
}

function isFavourite(value: unknown, id: string, provider: string): boolean {
    const favourite = toFavourite(value);
    return favourite?.id === id && favourite.provider === provider;
}

function toFavourite(value: unknown): GifFavourite | undefined {
    if (!isJsonObject(value)) return undefined;
    const id = stringField(value, "id");
    const provider = stringField(value, "p");
    return id !== undefined && provider !== undefined ? { id, provider } : undefined;
}
