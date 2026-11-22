/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { decode } from "blurhash";
import { logger } from "matrix-js-sdk/src/logger";

import { mediaFromMxc } from "../../../customisations/Media";
import { PHOTO_MAX_DIMENSION, PHOTO_MAX_SIZE } from "../model/constants";
import { aspectFill } from "../model/layout";
import { type PhotoWallpaper } from "../model/types";
import { type Size } from "./hooks";

/** The longest edge a photo wallpaper is decoded at. */
const MAX_DECODED_EDGE = 2048;
/** How far the image's own shape may be from the declared one, for rounding. */
const ASPECT_TOLERANCE = 0.02;
/** Fixed, so a crafted width and height cannot make the placeholder expensive. */
const BLURHASH_SIZE = 32;

class DownloadTooLargeError extends Error {}

/** Downloads at most `maxBytes`, refusing a larger file before and while it arrives. */
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

class PhotoRefusedError extends Error {}

/** The image's own size. An image that is never shown is not decoded, so only its header is read. */
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
            reject(new PhotoRefusedError("Not an image"));
        };
        image.src = url;
    });
}

/**
 * Decodes at most 2048 pixels on the long edge. The size comes from the image itself, not from what the event
 * declares, so a small declared size cannot hide a huge image: one larger than the apps accept, or of another shape
 * than declared, is refused.
 */
export async function decodePhoto(blob: Blob, declaredWidth: number, declaredHeight: number): Promise<ImageBitmap> {
    const { width, height } = await readImageSize(blob);
    if (!width || !height || width > PHOTO_MAX_DIMENSION || height > PHOTO_MAX_DIMENSION) {
        throw new PhotoRefusedError(`Photo wallpaper is ${width} by ${height} pixels`);
    }
    const shape = width / height / (declaredWidth / declaredHeight);
    if (!(Math.abs(Math.log(shape)) <= Math.log(1 + ASPECT_TOLERANCE))) {
        throw new PhotoRefusedError(
            `Photo wallpaper is ${width} by ${height}, not ${declaredWidth} by ${declaredHeight}`,
        );
    }
    const scale = Math.min(1, MAX_DECODED_EDGE / Math.max(width, height));
    return createImageBitmap(blob, {
        resizeWidth: Math.max(1, Math.round(width * scale)),
        resizeHeight: Math.max(1, Math.round(height * scale)),
        resizeQuality: "high",
    });
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

type PhotoState = { status: "loading" } | { status: "loaded"; bitmap: ImageBitmap } | { status: "failed" };

function usePhotoBitmap(url: string, size: number, width: number, height: number, local?: ImageBitmap): PhotoState {
    const [state, setState] = useState<PhotoState>({ status: "loading" });
    useEffect(() => {
        if (local) {
            setState({ status: "loaded", bitmap: local });
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
        fetchCapped(httpUrl, PHOTO_MAX_SIZE, abort.signal)
            .then((blob) => decodePhoto(blob, width, height))
            .then((decoded) => {
                bitmap = decoded;
                if (abort.signal.aborted) decoded.close();
                else setState({ status: "loaded", bitmap: decoded });
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
    }, [url, size, width, height, local]);
    return state;
}

interface PhotoLayerProps {
    photo: PhotoWallpaper;
    size: Size;
    dark: boolean;
    increasedContrast: boolean;
    /** A photo being edited, shown before it is uploaded. */
    local?: ImageBitmap;
}

/** A user's photo: the blurhash until it loads, never after a failure, and the dim only in dark appearance. */
export function PhotoLayer({ photo, size, dark, increasedContrast, local }: PhotoLayerProps): JSX.Element {
    const state = usePhotoBitmap(photo.url, photo.size, photo.w, photo.h, local);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (state.status !== "loaded") return;
        canvasRef.current?.getContext("2d")?.drawImage(state.bitmap, 0, 0);
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
                    width={state.bitmap.width}
                    height={state.bitmap.height}
                    style={rectStyle(size, state.bitmap.width, state.bitmap.height, photo)}
                />
            )}
            {!failed && dim > 0 && <div className="mx_GuaWallpaper_scrim" style={{ opacity: dim }} />}
        </>
    );
}
