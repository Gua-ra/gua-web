/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

export const CANVAS_SIZE = 512;
const PADDING = 16;
const SHRINK_FACTOR = 0.8;
const MIN_SIZE = 96;
const MAX_FILE_SIZE = 300_000;
const TEXT_MARGIN = 24;
const MAX_FONT_SIZE = 64;
const TEXT_OUTLINE_RATIO = 0.12;

export interface Size {
    width: number;
    height: number;
}

export interface Framing {
    scale: number;
    /** In canvas units. */
    offsetX: number;
    offsetY: number;
}

export interface StickerFile {
    blob: Blob;
    width: number;
    height: number;
}

/** The image aspect-fits the canvas at scale 1, then is scaled about the centre and moved. */
export function imageRect(image: Size, framing: Framing): { x: number; y: number; width: number; height: number } {
    const fit =
        Math.min(CANVAS_SIZE / Math.max(image.width, 1), CANVAS_SIZE / Math.max(image.height, 1)) * framing.scale;
    const width = image.width * fit;
    const height = image.height * fit;
    return {
        x: (CANVAS_SIZE - width) / 2 + framing.offsetX,
        y: (CANVAS_SIZE - height) / 2 + framing.offsetY,
        width,
        height,
    };
}

export function opaqueBounds(
    width: number,
    height: number,
    rgba: Uint8ClampedArray,
): { left: number; top: number; right: number; bottom: number } | undefined {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rgba[(y * width + x) * 4 + 3] !== 0) {
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
            }
        }
    }
    return right < 0 ? undefined : { left, top, right: right + 1, bottom: bottom + 1 };
}

/** Fits the trimmed content in a 480 box, so the padded sticker is at most 512 on its longer side. */
export function fittedContentSize(width: number, height: number): Size {
    const box = CANVAS_SIZE - 2 * PADDING;
    const scale = box / Math.max(width, height);
    return {
        width: Math.min(box, Math.max(1, Math.round(width * scale))),
        height: Math.min(box, Math.max(1, Math.round(height * scale))),
    };
}

export function shrunk(size: Size): Size | undefined {
    if (Math.max(size.width, size.height) <= MIN_SIZE) return undefined;
    return {
        width: Math.max(1, Math.round(size.width * SHRINK_FACTOR)),
        height: Math.max(1, Math.round(size.height * SHRINK_FACTOR)),
    };
}

/** Draws the framed photo and its caption on a 512 canvas, as the editor previews it. */
export function drawSticker(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource & Size,
    framing: Framing,
    text: string,
): void {
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const rect = imageRect(image, framing);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    drawCaption(context, text.trim());
}

function drawCaption(context: CanvasRenderingContext2D, text: string): void {
    if (!text) return;
    const maxWidth = CANVAS_SIZE - 2 * TEXT_MARGIN;
    let fontSize = MAX_FONT_SIZE;
    const font = (size: number): string => `900 ${size}px Inter, system-ui, sans-serif`;
    context.font = font(fontSize);
    while (context.measureText(text).width > maxWidth && fontSize > 12) {
        fontSize -= 2;
        context.font = font(fontSize);
    }
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.lineJoin = "round";
    const x = CANVAS_SIZE / 2;
    const y = CANVAS_SIZE - TEXT_MARGIN;
    context.lineWidth = Math.max(2, Math.round(fontSize * TEXT_OUTLINE_RATIO)) * 2;
    context.strokeStyle = "rgba(0, 0, 0, 0.85)";
    context.strokeText(text, x, y, maxWidth);
    context.fillStyle = "#ffffff";
    context.fillText(text, x, y, maxWidth);
}

/**
 * Trims the transparent edges, fits what is left with 16 px padding, and encodes it. WebP where the
 * browser can write it, PNG otherwise; anything over 300 KB is encoded again smaller.
 */
export async function encodeSticker(canvas: HTMLCanvasElement): Promise<StickerFile | undefined> {
    const context = canvas.getContext("2d")!;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const bounds = opaqueBounds(canvas.width, canvas.height, pixels.data);
    if (!bounds) return undefined;

    let content: Size | undefined = fittedContentSize(bounds.right - bounds.left, bounds.bottom - bounds.top);
    let encoded: StickerFile | undefined;
    while (content) {
        const output = document.createElement("canvas");
        output.width = content.width + 2 * PADDING;
        output.height = content.height + 2 * PADDING;
        const outputContext = output.getContext("2d")!;
        outputContext.imageSmoothingQuality = "high";
        outputContext.drawImage(
            canvas,
            bounds.left,
            bounds.top,
            bounds.right - bounds.left,
            bounds.bottom - bounds.top,
            PADDING,
            PADDING,
            content.width,
            content.height,
        );
        const blob = await toBlob(output);
        encoded = { blob, width: output.width, height: output.height };
        if (blob.size <= MAX_FILE_SIZE) break;
        content = shrunk(content);
    }
    return encoded;
}

async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    // Safari ignores the WebP request and writes PNG, which is fine.
    if (webp) return webp;
    return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("The sticker could not be encoded"))),
            "image/png",
        ),
    );
}
