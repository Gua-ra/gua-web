/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    isJsonObject,
    type JsonObject,
    numberField,
    type StickerImage,
    stickerImageFromJson,
    stickerImageToJson,
    stringField,
} from "./StickerImage";

export const STICKER_LIBRARY_EVENT_TYPE = "global.gua.stickers";
export const MAX_STICKERS = 120;
const MAX_FAVOURITES = 50;
const ADDED_KEY = "global.gua.added";

export interface OwnSticker {
    shortcode: string;
    image: StickerImage;
    /** Milliseconds since the epoch, undefined when another app added it. */
    addedAt?: number;
}

export interface StickerLibrary {
    favourites: StickerImage[];
    stickers: OwnSticker[];
}

export class StickerLimitReachedError extends Error {
    public constructor() {
        super(`My stickers already holds ${MAX_STICKERS} stickers`);
    }
}

/**
 * Reads and edits `global.gua.stickers`. Edits work on the stored JSON, so keys this version
 * does not know survive every rewrite.
 */
export function decodeStickerLibrary(content: JsonObject): StickerLibrary {
    return {
        favourites: arrayField(content, "favourites")
            .map((value) => stickerImageFromJson(value))
            .filter((image): image is StickerImage => !!image),
        stickers: validImages(content).sort(newestFirst),
    };
}

export function addSticker(content: JsonObject, image: StickerImage, now: number): JsonObject {
    if (validImages(content).length >= MAX_STICKERS) throw new StickerLimitReachedError();
    const images = isJsonObject(content.images) ? content.images : {};
    const shortcode = stickerShortcode(now, new Set(Object.keys(images)));
    const stored = { ...stickerImageToJson(image), [ADDED_KEY]: now };
    return withVersion({ ...content, images: { ...images, [shortcode]: stored } });
}

/** Puts `image` first in the favourites, keeping only its body, info and url. */
export function favouriteSticker(content: JsonObject, image: StickerImage, limit = MAX_FAVOURITES): JsonObject {
    const others = arrayField(content, "favourites").filter((value) => !hasUrl(value, image.url));
    const plain = stickerImageToJson({ url: image.url, body: image.body, info: image.info });
    return withVersion({ ...content, favourites: [plain, ...others].slice(0, limit) });
}

export function unfavouriteSticker(content: JsonObject, url: string): JsonObject {
    if (!Array.isArray(content.favourites)) return withVersion(content);
    return withVersion({ ...content, favourites: content.favourites.filter((value) => !hasUrl(value, url)) });
}

/** Deletes a sticker from My stickers and from the favourites. */
export function deleteSticker(content: JsonObject, shortcode: string): JsonObject {
    if (!isJsonObject(content.images)) return withVersion(content);
    const { [shortcode]: removed, ...images } = content.images;
    const withoutImage = { ...content, images };
    const url = isJsonObject(removed) ? stringField(removed, "url") : undefined;
    return url !== undefined ? unfavouriteSticker(withoutImage, url) : withVersion(withoutImage);
}

export function stickerShortcode(now: number, existing: Set<string>): string {
    const base = "s" + now.toString(36);
    if (!existing.has(base)) return base;
    for (let suffix = 2; ; suffix++) {
        const candidate = `${base}-${suffix}`;
        if (!existing.has(candidate)) return candidate;
    }
}

export function withVersion(content: JsonObject): JsonObject {
    const version = numberField(content, "v");
    return { ...content, v: version !== undefined && Number.isInteger(version) ? Math.max(1, version) : 1 };
}

export function arrayField(content: JsonObject, key: string): unknown[] {
    const value = content[key];
    return Array.isArray(value) ? value : [];
}

function validImages(content: JsonObject): OwnSticker[] {
    if (!isJsonObject(content.images)) return [];
    return Object.entries(content.images).flatMap(([shortcode, value]) => {
        const image = stickerImageFromJson(value);
        if (!image) return [];
        return [{ shortcode, image, addedAt: numberField(value as JsonObject, ADDED_KEY) }];
    });
}

function newestFirst(a: OwnSticker, b: OwnSticker): number {
    if (a.addedAt !== b.addedAt) {
        if (a.addedAt === undefined) return 1;
        if (b.addedAt === undefined) return -1;
        return b.addedAt - a.addedAt;
    }
    return a.shortcode < b.shortcode ? -1 : a.shortcode > b.shortcode ? 1 : 0;
}

function hasUrl(value: unknown, url: string): boolean {
    return isJsonObject(value) && value.url === url;
}
