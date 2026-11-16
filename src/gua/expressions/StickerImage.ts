/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

export type JsonObject = Record<string, unknown>;

/** An image pack image object. `info` is kept as received, so writing it back loses nothing. */
export interface StickerImage {
    url: string;
    body?: string;
    info?: JsonObject;
}

export function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(object: JsonObject | undefined, key: string): string | undefined {
    const value = object?.[key];
    return typeof value === "string" ? value : undefined;
}

export function numberField(object: JsonObject | undefined, key: string): number | undefined {
    const value = object?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Undefined for anything that is not an object with an mxc `url`. */
export function stickerImageFromJson(value: unknown, bodyFallback?: string): StickerImage | undefined {
    if (!isJsonObject(value)) return undefined;
    const url = stringField(value, "url");
    if (!url?.startsWith("mxc://")) return undefined;
    const body = stringField(value, "body") ?? bodyFallback;
    const info = isJsonObject(value.info) ? value.info : undefined;
    return { url, ...(body !== undefined && { body }), ...(info && { info }) };
}

export function stickerImageToJson(image: StickerImage): JsonObject {
    return {
        ...(image.body !== undefined && { body: image.body }),
        ...(image.info && { info: image.info }),
        url: image.url,
    };
}

export function isAnimatedSticker(image: StickerImage): boolean {
    return image.info?.is_animated === true || stringField(image.info, "mimetype") === "image/gif";
}

/** Case and accent insensitive, for searching bodies and shortcodes. */
export function searchKey(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase();
}
