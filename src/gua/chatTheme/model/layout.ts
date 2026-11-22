/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { ARTWORK_PIXEL_HEIGHT, ARTWORK_PIXEL_WIDTH } from "./constants";

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Where the shaders place a send pulse when no origin is given: a share of the visible chat, from its bottom-left. */
const PULSE_SPOT_X = 0.83;
const PULSE_SPOT_Y = 0.113;

/**
 * Scales an image to cover the frame and aligns the overflow: 0 pins the image's left or top edge, 1 its right or
 * bottom edge. The same as CSS `background-size: cover` with percentage positions.
 */
export function aspectFill(
    frameWidth: number,
    frameHeight: number,
    imageWidth: number,
    imageHeight: number,
    alignX: number,
    alignY: number,
): Rect {
    const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return { x: -(width - frameWidth) * alignX, y: -(height - frameHeight) * alignY, width, height };
}

export interface LiveFrame {
    canvasWidth: number;
    canvasHeight: number;
    /** `u_res`: the still's whole aspect-fill frame in render pixels, so the first frame matches the still. */
    resolution: [number, number];
    /** Added to `gl_FragCoord`, so a canvas the size of the view draws its part of the frame. Whole pixels keep it exact. */
    offset: [number, number];
    /** The frame in CSS pixels relative to the view's top-left corner. */
    frame: Rect;
    scale: number;
}

/** iOS draws at half the display scale; the web never draws less than one render pixel per CSS pixel. */
export function liveRenderScale(devicePixelRatio: number): number {
    return Math.max(1, devicePixelRatio / 2);
}

export function liveFrame(
    viewWidth: number,
    viewHeight: number,
    anchorX: number,
    anchorY: number,
    scale: number,
): LiveFrame {
    const frame = aspectFill(viewWidth, viewHeight, ARTWORK_PIXEL_WIDTH, ARTWORK_PIXEL_HEIGHT, anchorX, anchorY);
    return {
        canvasWidth: Math.round(viewWidth * scale),
        canvasHeight: Math.round(viewHeight * scale),
        resolution: [Math.round(frame.width * scale), Math.round(frame.height * scale)],
        offset: [Math.round(-frame.x * scale), Math.round((frame.y + frame.height - viewHeight) * scale)],
        frame,
        scale,
    };
}

/** The part of the view the chat shows in, relative to the view's top-left corner. */
export interface VisibleChat {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/**
 * `u_origin` for a send pulse: the default spot taken on the visible chat rather than the whole frame, in render
 * pixels of the frame with y from the bottom. Not mirrored for right-to-left layouts, as on iOS.
 */
export function pulseOrigin(live: LiveFrame, chat: VisibleChat): [number, number] {
    const spotX = chat.left + (chat.right - chat.left) * PULSE_SPOT_X;
    const spotY = chat.bottom - (chat.bottom - chat.top) * PULSE_SPOT_Y;
    return [(spotX - live.frame.x) * live.scale, live.resolution[1] - (spotY - live.frame.y) * live.scale];
}
