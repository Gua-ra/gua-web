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

/** The shaders' default send pulse spot, as fractions of the visible chat from its bottom-left. */
const PULSE_SPOT_X = 0.83;
const PULSE_SPOT_Y = 0.113;

/** CSS `background-size: cover` with percentage positions: align 0 pins the left or top edge, 1 the right or bottom. */
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
    /** Added to `gl_FragCoord` so a view-sized canvas draws its part of the frame; whole pixels keep it exact. */
    offset: [number, number];
    /** The frame in CSS pixels relative to the view's top-left corner. */
    frame: Rect;
    scale: number;
}

/** About 1080p, beyond which a laptop GPU cannot keep 30 frames a second. */
const LIVE_MAX_RENDER_PIXELS = 2_500_000;

/**
 * Half the display scale as on iOS, but at least one render pixel per CSS pixel unless the view would pass
 * LIVE_MAX_RENDER_PIXELS.
 */
export function liveRenderScale(devicePixelRatio: number, viewWidth: number, viewHeight: number): number {
    const scale = Math.max(1, devicePixelRatio / 2);
    const area = viewWidth * viewHeight * scale * scale;
    return area > LIVE_MAX_RENDER_PIXELS ? scale * Math.sqrt(LIVE_MAX_RENDER_PIXELS / area) : scale;
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

/** Where the chat shows, relative to the view's top-left corner. */
export interface VisibleChat {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/**
 * `u_origin` for a send pulse: the default spot on the visible chat, in frame render pixels with y from the bottom.
 * Not mirrored for right-to-left layouts, as on iOS.
 */
export function pulseOrigin(live: LiveFrame, chat: VisibleChat): [number, number] {
    const spotX = chat.left + (chat.right - chat.left) * PULSE_SPOT_X;
    const spotY = chat.bottom - (chat.bottom - chat.top) * PULSE_SPOT_Y;
    return [(spotX - live.frame.x) * live.scale, live.resolution[1] - (spotY - live.frame.y) * live.scale];
}
