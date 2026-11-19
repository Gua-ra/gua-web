/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { isJsonObject, type JsonObject, type StickerImage, stickerImageFromJson, stringField } from "./StickerImage";

export const IMAGE_PACK_EVENT_TYPE = "m.room.image_pack";
export const UNSTABLE_IMAGE_PACK_EVENT_TYPE = "im.ponies.room_emotes";

export interface PackSticker {
    shortcode: string;
    image: StickerImage;
}

export interface StickerPack {
    eventType: string;
    stateKey: string;
    displayName: string;
    avatarUrl?: string;
    stickers: PackSticker[];
}

export function decodeStickerPack(
    eventType: string,
    stateKey: string,
    content: JsonObject,
    roomName: string,
    roomAvatarUrl?: string,
): StickerPack {
    const pack = isJsonObject(content.pack) ? content.pack : undefined;
    const packIsForStickers = allowsStickers(pack?.usage);
    const images = isJsonObject(content.images) ? content.images : {};
    const stickers = Object.entries(images)
        .flatMap(([shortcode, value]) => {
            const image = stickerImageFromJson(value, shortcode);
            if (!image) return [];
            // Only the unstable format lets an image override its pack's usage.
            const imageUsage =
                eventType === UNSTABLE_IMAGE_PACK_EVENT_TYPE && Array.isArray((value as JsonObject).usage)
                    ? (value as JsonObject).usage
                    : undefined;
            const isSticker = imageUsage !== undefined ? allowsStickers(imageUsage) : packIsForStickers;
            return isSticker ? [{ shortcode, image }] : [];
        })
        .sort((a, b) => (a.shortcode < b.shortcode ? -1 : a.shortcode > b.shortcode ? 1 : 0));

    const displayName = stringField(pack, "display_name");
    const avatarUrl = stringField(pack, "avatar_url");
    return {
        eventType,
        stateKey,
        displayName: displayName?.trim() ? displayName : roomName,
        avatarUrl: avatarUrl?.startsWith("mxc://") ? avatarUrl : roomAvatarUrl,
        stickers,
    };
}

function allowsStickers(usage: unknown): boolean {
    if (!Array.isArray(usage) || usage.length === 0) return true;
    return usage.includes("sticker");
}
