/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useLayoutEffect, useRef, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import { type Artwork } from "../model/artworks";
import { liveFrame, liveRenderScale, pulseOrigin } from "../model/layout";
import { hasShaderFailed, LiveWallpaperRenderer, openContext, releaseContext } from "./renderer";
import { LIVE_SHADERS } from "./liveShaders";
import { FrameWatchdog, LiveWallpaperClock, type SendPulse, type WallpaperMotion, wallpaperMotion } from "./timing";
import { reportSlowFrames, useMotionConditions } from "./useMotionConditions";

interface Props {
    /** Mount one canvas per artwork. */
    artwork: Artwork;
    dark: boolean;
    width: number;
    height: number;
    /** Inside a dialog no other dialog pauses the wallpaper; in the timeline any dialog does. */
    inDialog: boolean;
    /** Holds the current frame, as an outgoing wallpaper does while the next one fades in over it. */
    frozen?: boolean;
    pulse?: SendPulse;
    onMotion?: (motion: WallpaperMotion) => void;
}

function useShaderSource(artwork: Artwork): string | null {
    const [frag, setFrag] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        LIVE_SHADERS.get(artwork.id)?.()
            .then((module) => {
                if (!cancelled) setFrag(module.default);
            })
            .catch((error) => logger.warn(`Could not load the live wallpaper ${artwork.id}`, error));
        return () => {
            cancelled = true;
        };
    }, [artwork.id]);
    return frag;
}

interface Surface {
    canvas: HTMLCanvasElement;
    renderer: LiveWallpaperRenderer;
}

/**
 * A live artwork drawn over its still, on exactly the still's aspect-fill frame so the first frame is the still.
 * The canvas stays transparent until it has drawn, and whenever the wallpaper must show its still.
 *
 * Each mount makes its own canvas and releases its context on unmount, so a development double mount never reuses
 * a released context. A lost context is final for the mount: the still shows until the artwork or room changes.
 */
export function LiveWallpaperCanvas(props: Props): JSX.Element {
    const { artwork, dark, width, height, inDialog, frozen, pulse, onMotion } = props;
    const wrapperRef = useRef<HTMLDivElement>(null);
    const frag = useShaderSource(artwork);
    const [surface, setSurface] = useState<Surface | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const view = useMotionConditions(wrapperRef, inDialog);

    const motion = wallpaperMotion({
        ...view,
        rendererUnavailable: !surface || unavailable || hasShaderFailed(artwork.id),
        covered: view.covered || !!frozen,
    });

    const live = liveFrame(
        width,
        height,
        artwork.anchor.x,
        artwork.anchor.y,
        liveRenderScale(window.devicePixelRatio || 1, width, height),
    );
    const clockRef = useRef<LiveWallpaperClock | null>(null);
    const drawRef = useRef<(nowMs: number, animating: boolean) => void>(() => {});

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || !frag) return;
        const canvas = document.createElement("canvas");
        canvas.className = "mx_GuaWallpaper_live";
        canvas.style.opacity = "0";
        wrapper.appendChild(canvas);
        const gl = openContext(canvas);
        if (!gl) {
            canvas.remove();
            setUnavailable(true);
            return;
        }
        let cancelled = false;
        let renderer: LiveWallpaperRenderer | null = null;
        const onLost = (): void => setUnavailable(true);
        canvas.addEventListener("webglcontextlost", onLost);
        LiveWallpaperRenderer.create(gl, artwork.id, frag).then((created) => {
            if (cancelled) {
                created?.dispose();
                return;
            }
            renderer = created;
            if (created) setSurface({ canvas, renderer: created });
            else setUnavailable(true);
        });
        return () => {
            cancelled = true;
            canvas.removeEventListener("webglcontextlost", onLost);
            renderer?.dispose();
            releaseContext(gl);
            canvas.remove();
            setSurface(null);
        };
    }, [artwork.id, frag]);

    useLayoutEffect(() => {
        drawRef.current = (nowMs: number, animating: boolean): void => {
            const clock = clockRef.current;
            if (!surface || !clock) return;
            surface.renderer.draw({
                resolution: live.resolution,
                offset: live.offset,
                time: clock.time,
                dark,
                pulse: animating && pulse ? pulse.at(nowMs) : 0,
                origin: pulseOrigin(live, { left: 0, right: width, top: 0, bottom: height }),
            });
            setHasDrawn(true);
        };
    });

    useEffect(() => {
        if (motion === "still") {
            // A new clock after any still, so the first frame shown again is the still.
            clockRef.current = null;
            setHasDrawn(false);
            return;
        }
        if (motion !== "animating") return;
        clockRef.current ??= new LiveWallpaperClock(artwork.stillTime ?? 0);
        const clock = clockRef.current;
        clock.resume();
        const watchdog = new FrameWatchdog();
        let frame = requestAnimationFrame(function tick(now: number): void {
            if (clock.onFrame(now)) {
                drawRef.current(now, true);
                if (watchdog.onFrame(now)) {
                    reportSlowFrames();
                    return;
                }
            }
            frame = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(frame);
    }, [motion, artwork.stillTime]);

    // Resizing the canvas clears it, so it is drawn again before the browser paints. A paused frame holds its time
    // but shows no pulse.
    const { canvasWidth, canvasHeight } = live;
    useLayoutEffect(() => {
        if (!surface) return;
        const { canvas } = surface;
        if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
        if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
        if (motion !== "still") drawRef.current(performance.now(), false);
    }, [surface, canvasWidth, canvasHeight, dark, motion]);

    useLayoutEffect(() => {
        if (surface) surface.canvas.style.opacity = motion !== "still" && hasDrawn ? "1" : "0";
    }, [surface, motion, hasDrawn]);

    useEffect(() => {
        onMotion?.(motion);
    }, [motion, onMotion]);

    return <div ref={wrapperRef} className="mx_GuaWallpaper_liveFrame" aria-hidden={true} />;
}
