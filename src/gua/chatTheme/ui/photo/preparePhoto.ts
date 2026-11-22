/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { encode } from "blurhash";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { type PhotoWallpaper } from "../../model/types";
import { readImageSize } from "../../render/PhotoLayer";

const PHOTO_MIMETYPE = "image/jpeg";
// The apps encode with the same passes.
const FIRST_PASS = { maxEdge: 2048, quality: 0.8 };
const SECOND_PASS = { maxEdge: 1600, quality: 0.75 };
const SECOND_PASS_ABOVE_BYTES = 1_500_000;
const BLURHASH_WIDTH = 64;
/** The browser may decode the full frame before resizing it, at 4 bytes a pixel. */
const MAX_CHOSEN_PIXELS = 100_000_000;

export class PhotoTooLargeError extends Error {}

export interface PreparedPhoto {
    blob: Blob;
    width: number;
    height: number;
    blurhash: string;
    bitmap: ImageBitmap;
}

function canvasOf(width: number, height: number): CanvasRenderingContext2D {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { colorSpace: "srgb" });
    if (!context) throw new Error("No 2D canvas");
    return context;
}

/** Redrawing over black into sRGB keeps metadata, location and transparency out of the upload. */
async function encodeJpeg(
    source: ImageBitmap,
    pass: { maxEdge: number; quality: number },
): Promise<{ blob: Blob; context: CanvasRenderingContext2D }> {
    const scale = Math.min(1, pass.maxEdge / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const context = canvasOf(width, height);
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
        context.canvas.toBlob(resolve, PHOTO_MIMETYPE, pass.quality),
    );
    if (!blob) throw new Error("Could not encode the photo");
    return { blob, context };
}

function blurhashOf(source: ImageBitmap): string {
    const height = Math.max(1, Math.round((BLURHASH_WIDTH * source.height) / source.width));
    const context = canvasOf(BLURHASH_WIDTH, height);
    context.drawImage(source, 0, 0, BLURHASH_WIDTH, height);
    return encode(context.getImageData(0, 0, BLURHASH_WIDTH, height).data, BLURHASH_WIDTH, height, 3, 3);
}

/**
 * Keeps at most 2048 px on the long edge, though the browser may decode the full frame first. Giving only one
 * dimension keeps the shape where the size read from the file ignores its orientation.
 */
async function decodeChosen(file: Blob): Promise<ImageBitmap> {
    const { width, height } = await readImageSize(file);
    if (width * height > MAX_CHOSEN_PIXELS) throw new PhotoTooLargeError();
    const longEdge = Math.max(width, height);
    if (longEdge <= FIRST_PASS.maxEdge) return createImageBitmap(file, { imageOrientation: "from-image" });
    const resize = width >= height ? { resizeWidth: FIRST_PASS.maxEdge } : { resizeHeight: FIRST_PASS.maxEdge };
    return createImageBitmap(file, { imageOrientation: "from-image", resizeQuality: "high", ...resize });
}

export async function preparePhoto(file: Blob, maxUploadSize: number | undefined): Promise<PreparedPhoto> {
    const source = await decodeChosen(file);
    try {
        let encoded = await encodeJpeg(source, FIRST_PASS);
        if (encoded.blob.size > SECOND_PASS_ABOVE_BYTES) encoded = await encodeJpeg(source, SECOND_PASS);
        if (maxUploadSize !== undefined && encoded.blob.size > maxUploadSize) throw new PhotoTooLargeError();
        const { canvas } = encoded.context;
        return {
            blob: encoded.blob,
            width: canvas.width,
            height: canvas.height,
            blurhash: blurhashOf(source),
            bitmap: await createImageBitmap(canvas),
        };
    } finally {
        source.close();
    }
}

export async function maxUploadSize(client: MatrixClient): Promise<number | undefined> {
    try {
        return (await client.getMediaConfig())["m.upload.size"];
    } catch {
        return undefined;
    }
}

type PhotoPlacement = Pick<PhotoWallpaper, "dim" | "alignX" | "alignY">;

export function photoWallpaper(photo: PreparedPhoto, url: string, placement: PhotoPlacement): PhotoWallpaper {
    return {
        url,
        mimetype: PHOTO_MIMETYPE,
        w: photo.width,
        h: photo.height,
        size: photo.blob.size,
        blurhash: photo.blurhash,
        ...placement,
    };
}

/** Unencrypted, so every member of the chat and every device of the user can show it. */
export async function uploadPhoto(
    client: MatrixClient,
    photo: PreparedPhoto,
    placement: PhotoPlacement,
): Promise<PhotoWallpaper> {
    const { content_uri: url } = await client.uploadContent(photo.blob, {
        type: PHOTO_MIMETYPE,
        includeFilename: false,
    });
    return photoWallpaper(photo, url, placement);
}
