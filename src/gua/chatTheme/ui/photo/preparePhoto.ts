/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { encode } from "blurhash";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { PHOTO_DEFAULT_ALIGN, PHOTO_DEFAULT_DIM } from "../../model/constants";
import { type PhotoWallpaper } from "../../model/types";
import { readImageSize } from "../../render/PhotoLayer";

export const PHOTO_MIMETYPE = "image/jpeg";
const FIRST_PASS = { maxEdge: 2048, quality: 0.8 };
const SECOND_PASS = { maxEdge: 1600, quality: 0.75 };
/** Over this, the photo is encoded again smaller. */
const SECOND_PASS_ABOVE_BYTES = 1_500_000;
const BLURHASH_WIDTH = 64;

export class PhotoTooLargeError extends Error {}

export interface PreparedPhoto {
    blob: Blob;
    width: number;
    height: number;
    blurhash: string;
    /** The encoded photo, for the editor's preview. */
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

/** Redrawn over black into sRGB, so no metadata, location or transparency reaches the upload. */
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
 * A camera photo is decoded at most 2048 px on its long edge rather than at full size, which for 48 megapixels would
 * take about 190 MB. Only the long edge is given, so the shape stays right even where the size read from the file
 * does not follow its orientation.
 */
async function decodeChosen(file: Blob): Promise<ImageBitmap> {
    const { width, height } = await readImageSize(file);
    const longEdge = Math.max(width, height);
    if (longEdge <= FIRST_PASS.maxEdge) return createImageBitmap(file, { imageOrientation: "from-image" });
    const resize = width >= height ? { resizeWidth: FIRST_PASS.maxEdge } : { resizeHeight: FIRST_PASS.maxEdge };
    return createImageBitmap(file, { imageOrientation: "from-image", resizeQuality: "high", ...resize });
}

/**
 * Turns a chosen file into the photo the apps upload: oriented, at most 2048 px on the long edge as JPEG 0.8, or
 * 1600 px at 0.75 when that is over 1.5 MB. Refuses a result over the server's upload limit.
 */
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

/** Uploads unencrypted: everyone in a chat, and every device of the user, must be able to show it. */
export async function uploadPhoto(
    client: MatrixClient,
    photo: PreparedPhoto,
    placement: { dim: number; alignX: number; alignY: number } = {
        dim: PHOTO_DEFAULT_DIM,
        alignX: PHOTO_DEFAULT_ALIGN,
        alignY: PHOTO_DEFAULT_ALIGN,
    },
): Promise<PhotoWallpaper> {
    const { content_uri: url } = await client.uploadContent(photo.blob, {
        type: PHOTO_MIMETYPE,
        includeFilename: false,
    });
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
