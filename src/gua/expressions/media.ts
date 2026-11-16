/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useSyncExternalStore } from "react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { mediaFromMxc } from "../../customisations/Media";
import { isAnimatedSticker, type StickerImage } from "./StickerImage";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(listener: () => void): () => void {
    const query = window.matchMedia?.(REDUCED_MOTION);
    query?.addEventListener("change", listener);
    return () => query?.removeEventListener("change", listener);
}

/** The panel's one "should animate" check: the system's reduced motion preference. */
export function useShouldAnimate(): boolean {
    return useSyncExternalStore(subscribe, () => !window.matchMedia?.(REDUCED_MOTION).matches);
}

/**
 * The full file, which is at most 512 px; a server thumbnail would drop transparency or animation.
 * An animated sticker that should not animate uses the thumbnail, which is its first frame.
 */
export function stickerSrc(client: MatrixClient, image: StickerImage, animate: boolean): string | undefined {
    const media = mediaFromMxc(image.url, client);
    if (!animate && isAnimatedSticker(image)) return media.getThumbnailOfSourceHttp(256, 256, "scale") ?? undefined;
    return media.srcHttp ?? undefined;
}
