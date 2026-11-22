/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { decode } from "blurhash";
import { logger } from "matrix-js-sdk/src/logger";

import { mediaFromMxc } from "../../../customisations/Media";
import { PHOTO_MAX_SIZE } from "../model/constants";
import { aspectFill } from "../model/layout";
import { type PhotoWallpaper } from "../model/types";
import { type Size, useDevicePixelRatio } from "./hooks";

const MAX_DECODED_EDGE = 2048;
/** Chromium decodes the full frame before createImageBitmap resizes it, and Gua uploads at most 2048 px. */
const MAX_SOURCE_EDGE = 4096;
/** Rounded up in steps, so resizing a preview decodes again only now and then. */
const SMALL_EDGE_STEP = 256;
/** Allows for rounding in the declared width and height. */
const ASPECT_TOLERANCE = 0.02;
/** Fixed, so a crafted width and height cannot make the placeholder expensive. */
const BLURHASH_SIZE = 32;

class DownloadTooLargeError extends Error {}

/** Enforces `maxBytes` while streaming too, since the declared length can be missing or false. */
export async function fetchCapped(url: string, maxBytes: number, signal?: AbortSignal): Promise<Blob> {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Photo wallpaper download failed: ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw new DownloadTooLargeError();
    if (!response.body) {
        const blob = await response.blob();
        if (blob.size > maxBytes) throw new DownloadTooLargeError();
        return blob;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new DownloadTooLargeError();
        }
        chunks.push(value);
    }
    return new Blob(chunks as BlobPart[], { type });
}

/** Reads only the header: an image that is never shown is not decoded. */
export function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = (): void => {
            URL.revokeObjectURL(url);
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = (): void => {
            URL.revokeObjectURL(url);
            reject(new Error("Not an image"));
        };
        image.src = url;
    });
}

/**
 * Checks the image's real size, not the event's declared one, so a small declared size cannot hide a huge image or
 * one of another shape.
 */
export async function decodePhoto(
    blob: Blob,
    declaredWidth: number,
    declaredHeight: number,
    maxEdge = MAX_DECODED_EDGE,
): Promise<ImageBitmap> {
    const { width, height } = await readImageSize(blob);
    if (!width || !height || width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE) {
        throw new Error(`Photo wallpaper is ${width} by ${height} pixels`);
    }
    const shape = width / height / (declaredWidth / declaredHeight);
    if (!(Math.abs(Math.log(shape)) <= Math.log(1 + ASPECT_TOLERANCE))) {
        throw new Error(`Photo wallpaper is ${width} by ${height}, not ${declaredWidth} by ${declaredHeight}`);
    }
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return createImageBitmap(blob, {
        resizeWidth: Math.max(1, Math.round(width * scale)),
        resizeHeight: Math.max(1, Math.round(height * scale)),
        resizeQuality: "high",
    });
}

function smallViewEdge(size: Size, photo: PhotoWallpaper, devicePixelRatio: number): number {
    const rect = aspectFill(size.width, size.height, photo.w, photo.h, 0, 0);
    const edge = Math.max(rect.width, rect.height) * devicePixelRatio;
    return Math.min(MAX_DECODED_EDGE, Math.ceil(edge / SMALL_EDGE_STEP) * SMALL_EDGE_STEP);
}

function rectStyle(size: Size, width: number, height: number, photo: PhotoWallpaper): CSSProperties {
    const rect = aspectFill(size.width, size.height, width, height, photo.alignX / 1000, photo.alignY / 1000);
    return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

function Blurhash({ hash, style }: { hash: string; style: CSSProperties }): JSX.Element {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const context = ref.current?.getContext("2d");
        if (!context) return;
        try {
            const pixels = decode(hash, BLURHASH_SIZE, BLURHASH_SIZE);
            const image = context.createImageData(BLURHASH_SIZE, BLURHASH_SIZE);
            image.data.set(pixels);
            context.putImageData(image, 0, 0);
        } catch (error) {
            logger.warn("Invalid photo wallpaper blurhash", error);
        }
    }, [hash]);
    return (
        <canvas
            ref={ref}
            className="mx_GuaWallpaper_photo"
            width={BLURHASH_SIZE}
            height={BLURHASH_SIZE}
            style={style}
        />
    );
}

type PhotoState =
    | { status: "loading" }
    | { status: "loaded"; bitmap: ImageBitmap; width: number; height: number; owned: boolean }
    | { status: "failed" };

/** Keeps the size apart, since a closed bitmap reports 0 by 0. */
const loaded = (bitmap: ImageBitmap, owned: boolean): PhotoState => ({
    status: "loaded",
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    owned,
});

function usePhotoBitmap(
    url: string,
    size: number,
    width: number,
    height: number,
    maxEdge: number,
    local?: ImageBitmap,
): PhotoState {
    const [state, setState] = useState<PhotoState>({ status: "loading" });
    useEffect(() => {
        if (local) {
            setState(loaded(local, false));
            return;
        }
        const abort = new AbortController();
        let bitmap: ImageBitmap | undefined;
        setState({ status: "loading" });
        const httpUrl = mediaFromMxc(url).srcHttp;
        if (!httpUrl || size > PHOTO_MAX_SIZE) {
            setState({ status: "failed" });
            return;
        }
        // A small view has no size until it is measured.
        if (!maxEdge) return;
        fetchCapped(httpUrl, PHOTO_MAX_SIZE, abort.signal)
            .then((blob) => decodePhoto(blob, width, height, maxEdge))
            .then((decoded) => {
                bitmap = decoded;
                if (abort.signal.aborted) decoded.close();
                else setState(loaded(decoded, true));
            })
            .catch((error) => {
                if (abort.signal.aborted) return;
                logger.warn("Could not show the photo wallpaper", error);
                setState({ status: "failed" });
            });
        return () => {
            abort.abort();
            bitmap?.close();
        };
    }, [url, size, width, height, maxEdge, local]);
    return state;
}

interface PhotoLayerProps {
    photo: PhotoWallpaper;
    size: Size;
    dark: boolean;
    increasedContrast: boolean;
    /** Decodes only for `size`, where the chat view keeps 2048 px so resizing it never decodes again. */
    small?: boolean;
    /** A photo being edited, shown before it is uploaded. */
    local?: ImageBitmap;
}

export function PhotoLayer({ photo, size, dark, increasedContrast, small, local }: PhotoLayerProps): JSX.Element {
    const devicePixelRatio = useDevicePixelRatio();
    const maxEdge = small ? smallViewEdge(size, photo, devicePixelRatio) : MAX_DECODED_EDGE;
    const state = usePhotoBitmap(photo.url, photo.size, photo.w, photo.h, maxEdge, local);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        // A closed bitmap is 0 by 0. StrictMode runs this twice, and the canvas already holds the pixels.
        if (state.status !== "loaded" || !state.bitmap.width) return;
        canvasRef.current?.getContext("2d")?.drawImage(state.bitmap, 0, 0);
        // The canvas keeps its pixels, since a resize only restyles it.
        if (state.owned) state.bitmap.close();
    }, [state]);

    const failed = state.status === "failed";
    const dim = dark ? Math.max(photo.dim / 100, increasedContrast ? 0.5 : 0) : increasedContrast ? 0.06 : 0;
    return (
        <>
            {state.status === "loading" && photo.blurhash && (
                <Blurhash hash={photo.blurhash} style={rectStyle(size, photo.w, photo.h, photo)} />
            )}
            {state.status === "loaded" && (
                <canvas
                    ref={canvasRef}
                    className="mx_GuaWallpaper_photo"
                    width={state.width}
                    height={state.height}
                    style={rectStyle(size, state.width, state.height, photo)}
                />
            )}
            {!failed && dim > 0 && <div className="mx_GuaWallpaper_scrim" style={{ opacity: dim }} />}
        </>
    );
}
