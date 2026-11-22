/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useRef, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import { type Artwork } from "../model/artworks";
import { liveFrame, liveRenderScale, pulseOrigin, type VisibleChat } from "../model/layout";
import { hasShaderFailed, LiveWallpaperRenderer } from "./renderer";
import { LIVE_SHADERS } from "./liveShaders";
import { FrameWatchdog, LiveWallpaperClock, type SendPulse, wallpaperMotion } from "./timing";
import { reportSlowFrames, useMotionConditions } from "./useMotionConditions";

interface Props {
    /** Mount one canvas per artwork: a disposed renderer loses its canvas's context. */
    artwork: Artwork;
    dark: boolean;
    width: number;
    height: number;
    /** Inside a dialog only the dialogs opened above it pause the wallpaper; in the timeline any dialog does. */
    inDialog: boolean;
    pulse?: SendPulse;
    /** Changes on each send, so where the chat shows is read again for the pulse. */
    pulseCount?: number;
    /** The part of the box the chat shows in, where a send pulse starts. Defaults to the whole box. */
    visibleChat?: () => VisibleChat;
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

/**
 * A live artwork drawn over its still, on exactly the still's aspect-fill frame so the first frame is the still.
 * The canvas stays transparent until it has drawn, and whenever the wallpaper must show its still.
 */
export function LiveWallpaperCanvas(props: Props): JSX.Element {
    const { artwork, dark, width, height, inDialog, pulse, pulseCount, visibleChat } = props;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frag = useShaderSource(artwork);
    const [renderer, setRenderer] = useState<LiveWallpaperRenderer | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const view = useMotionConditions(canvasRef, inDialog);

    const motion = wallpaperMotion({
        rendererUnavailable: !renderer || unavailable || hasShaderFailed(artwork.id),
        ...view,
    });

    const live = liveFrame(
        width,
        height,
        artwork.anchor.x,
        artwork.anchor.y,
        liveRenderScale(window.devicePixelRatio || 1),
    );
    const clockRef = useRef<LiveWallpaperClock | null>(null);
    const chatRef = useRef<VisibleChat | null>(null);
    const drawRef = useRef<(nowMs: number, animating: boolean) => void>(() => {});

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !frag) return;
        const onLost = (event: Event): void => {
            event.preventDefault();
            setUnavailable(true);
        };
        canvas.addEventListener("webglcontextlost", onLost);
        const created = LiveWallpaperRenderer.create(canvas, artwork.id, frag);
        if (created) setRenderer(created);
        else setUnavailable(true);
        return () => {
            canvas.removeEventListener("webglcontextlost", onLost);
            created?.dispose();
            setRenderer(null);
        };
    }, [artwork.id, frag]);

    useEffect(() => {
        chatRef.current = visibleChat?.() ?? null;
    }, [visibleChat, pulseCount, width, height]);

    useEffect(() => {
        drawRef.current = (nowMs: number, animating: boolean): void => {
            const clock = clockRef.current;
            if (!renderer || !clock) return;
            const chat = chatRef.current ?? { left: 0, right: width, top: 0, bottom: height };
            renderer.draw({
                resolution: live.resolution,
                offset: live.offset,
                time: clock.time,
                dark,
                pulse: animating && pulse ? pulse.at(nowMs) : 0,
                origin: pulseOrigin(live, chat),
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

    useEffect(() => {
        // A paused frame holds its time but shows no pulse, and follows the appearance and size.
        if (motion === "paused") drawRef.current(performance.now(), false);
    }, [motion, dark, width, height]);

    return (
        <canvas
            ref={canvasRef}
            className="mx_GuaWallpaper_live"
            width={live.canvasWidth}
            height={live.canvasHeight}
            style={{ opacity: motion !== "still" && hasDrawn ? 1 : 0 }}
            aria-hidden={true}
        />
    );
}
