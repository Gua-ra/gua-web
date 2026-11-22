/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { findArtwork, getArtwork } from "./artworks";
import { type BubbleId, isBubbleId } from "./bubbles";
import {
    PHOTO_DEFAULT_ALIGN,
    PHOTO_DEFAULT_DIM,
    PHOTO_MAX_ALIGN,
    PHOTO_MAX_BLURHASH_LENGTH,
    PHOTO_MAX_DIM,
    PHOTO_MAX_DIMENSION,
    PHOTO_MAX_SIZE,
} from "./constants";
import { isPresetId } from "./presets";
import { type ChatTheme, isStock, makeTheme, NO_WALLPAPER, type PhotoWallpaper, STOCK, type Wallpaper } from "./types";

type JsonObject = Record<string, unknown>;

const INVALID = Symbol("invalid");

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts 800.0 as 800 and, like iOS, rejects whole numbers outside the 64-bit range. */
function wholeNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= -(2 ** 63) && value < 2 ** 63
        ? value
        : undefined;
}

/** Absent or null takes the default; any other non-integer invalidates the photo. */
function optionalWholeNumber(object: JsonObject, key: string): number | undefined | typeof INVALID {
    const value = object[key];
    if (value === undefined || value === null) return undefined;
    return wholeNumber(value) ?? INVALID;
}

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

function presetWallpaper(id: unknown): Wallpaper {
    return isPresetId(id) ? { kind: "preset", preset: id } : NO_WALLPAPER;
}

function decodePhoto(value: unknown): PhotoWallpaper | undefined {
    if (!isObject(value)) return undefined;
    const { url, mimetype, blurhash } = value;
    const w = wholeNumber(value.w);
    const h = wholeNumber(value.h);
    const size = wholeNumber(value.size);
    if (typeof url !== "string" || !url.startsWith("mxc://")) return undefined;
    if (typeof mimetype !== "string" || !mimetype.startsWith("image/")) return undefined;
    if (w === undefined || w < 1 || w > PHOTO_MAX_DIMENSION) return undefined;
    if (h === undefined || h < 1 || h > PHOTO_MAX_DIMENSION) return undefined;
    if (size === undefined || size < 1 || size > PHOTO_MAX_SIZE) return undefined;
    if (blurhash !== undefined && blurhash !== null) {
        if (typeof blurhash !== "string" || blurhash.length > PHOTO_MAX_BLURHASH_LENGTH) return undefined;
    }

    const align = value.align ?? {};
    if (!isObject(align)) return undefined;
    const dim = optionalWholeNumber(value, "dim");
    const alignX = optionalWholeNumber(align, "x");
    const alignY = optionalWholeNumber(align, "y");
    if (dim === INVALID || alignX === INVALID || alignY === INVALID) return undefined;

    return {
        url,
        mimetype,
        w,
        h,
        size,
        blurhash: typeof blurhash === "string" ? blurhash : null,
        dim: clamp(dim ?? PHOTO_DEFAULT_DIM, PHOTO_MAX_DIM),
        alignX: clamp(alignX ?? PHOTO_DEFAULT_ALIGN, PHOTO_MAX_ALIGN),
        alignY: clamp(alignY ?? PHOTO_DEFAULT_ALIGN, PHOTO_MAX_ALIGN),
    };
}

function decodeWallpaper(content: JsonObject, isVersion1: boolean): Wallpaper {
    if (!isVersion1) return presetWallpaper(content.fallback_preset);
    switch (content.kind) {
        case "none":
            return NO_WALLPAPER;
        case "preset":
            return presetWallpaper(content.preset);
        case "art": {
            const artwork = findArtwork(content.art);
            return artwork ? { kind: "art", art: artwork.id } : presetWallpaper(content.fallback_preset);
        }
        case "photo": {
            const photo = decodePhoto(content.photo);
            return photo ? { kind: "photo", photo } : NO_WALLPAPER;
        }
        default:
            return presetWallpaper(content.fallback_preset);
    }
}

/** Unreadable content is STOCK; content of a version other than 1 keeps only its fallback preset. */
export function decodeChatTheme(content: unknown): ChatTheme {
    if (!isObject(content)) return STOCK;
    const isVersion1 = wholeNumber(content.v) === 1;
    const wallpaper = decodeWallpaper(content, isVersion1);
    const bubble: BubbleId = isVersion1 && isBubbleId(content.bubble) ? content.bubble : "standard";
    const bubbleDark = isVersion1 && isBubbleId(content.bubble_dark) ? content.bubble_dark : undefined;
    const theme = makeTheme(wallpaper, bubble, bubbleDark);
    return isStock(theme) ? STOCK : theme;
}

/** Keys go in sorted order so `JSON.stringify` gives the same bytes as the apps. */
export function encodeChatTheme(theme: ChatTheme): JsonObject {
    if (isStock(theme)) return {};
    const { wallpaper } = theme;
    const content: JsonObject = {};
    if (wallpaper.kind === "art") content.art = wallpaper.art;
    if (theme.bubble !== "standard") content.bubble = theme.bubble;
    if (theme.bubbleDark) content.bubble_dark = theme.bubbleDark;
    if (wallpaper.kind === "art") content.fallback_preset = getArtwork(wallpaper.art).fallback;
    content.kind = wallpaper.kind;
    if (wallpaper.kind === "photo") {
        const { photo } = wallpaper;
        const encoded: JsonObject = { align: { x: photo.alignX, y: photo.alignY } };
        if (photo.blurhash !== null) encoded.blurhash = photo.blurhash;
        encoded.dim = photo.dim;
        encoded.h = photo.h;
        encoded.mimetype = photo.mimetype;
        encoded.size = photo.size;
        encoded.url = photo.url;
        encoded.w = photo.w;
        content.photo = encoded;
    }
    if (wallpaper.kind === "preset") content.preset = wallpaper.preset;
    content.v = 1;
    return content;
}
