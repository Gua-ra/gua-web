/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type JsonObject, type StickerImage } from "./StickerImage";

const MAX_DISPLAY_SIZE = 256;
export const DEFAULT_STICKER_BODY = "Sticker";

export interface StickerFileFacts {
    url: string;
    body: string;
    width: number;
    height: number;
    mimetype: string;
    size: number;
    isAnimated?: boolean;
}

/** Half the pixel size, scaled down to fit within 256. */
export function displaySize(pixelWidth: number, pixelHeight: number): { w: number; h: number } {
    const halfWidth = pixelWidth / 2;
    const halfHeight = pixelHeight / 2;
    const scale = Math.min(1, MAX_DISPLAY_SIZE / Math.max(halfWidth, halfHeight));
    return {
        w: Math.max(1, Math.round(halfWidth * scale)),
        h: Math.max(1, Math.round(halfHeight * scale)),
    };
}

export function stickerImageForFile(file: StickerFileFacts): StickerImage {
    const { w, h } = displaySize(file.width, file.height);
    return {
        url: file.url,
        body: file.body,
        info: { h, ...(file.isAnimated && { is_animated: true }), mimetype: file.mimetype, size: file.size, w },
    };
}

/** `m.sticker` content; `relation` is the composer's `m.relates_to`, already holding any reply. */
export function stickerContent(image: StickerImage, relation?: JsonObject): JsonObject {
    return {
        body: image.body?.trim() ? image.body : DEFAULT_STICKER_BODY,
        info: image.info ?? {},
        url: image.url,
        ...(relation && Object.keys(relation).length > 0 && { "m.relates_to": relation }),
    };
}
