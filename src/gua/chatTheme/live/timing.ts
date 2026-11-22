/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

export const LIVE_WALLPAPER_FPS = 30;
const FRAME_MS = 1000 / LIVE_WALLPAPER_FPS;
/**
 * How far an animation frame may land from a frame boundary and still count as on it, so 60, 90 and 120 Hz displays
 * all draw every 33 ms, and a frame one 60 Hz frame late (50 ms) is not a slow frame.
 */
const FRAME_TOLERANCE_MS = 4;

/** Keeps the float time small enough that it never loses precision. */
const TIME_PERIOD_SECONDS = 1800;
const PULSE_RISE_SECONDS = 0.25;
const PULSE_DECAY_SECONDS = 0.9;
const PULSE_END_SECONDS = 4.2;

/** The shader's `u_time`: it starts at the still's time, so the first frame is the still. */
export function liveWallpaperTime(stillTime: number, elapsedSeconds: number): number {
    return (stillTime + elapsedSeconds) % TIME_PERIOD_SECONDS;
}

export function sendPulse(secondsSinceStart: number): number {
    if (secondsSinceStart < 0 || secondsSinceStart > PULSE_END_SECONDS) return 0;
    const rise = Math.min(1, secondsSinceStart / PULSE_RISE_SECONDS);
    const decay = Math.exp(-Math.max(0, secondsSinceStart - PULSE_RISE_SECONDS) / PULSE_DECAY_SECONDS);
    return rise * rise * (3 - 2 * rise) * decay;
}

function sendPulseRiseSeconds(value: number): number {
    return PULSE_RISE_SECONDS * (0.5 - Math.sin(Math.asin(1 - 2 * value) / 3));
}

/**
 * The user's sends as the wallpaper's pulse, in real time. A send while a pulse shows never restarts it from 0,
 * which would snap the shaders' rings back: the new pulse starts where its rising edge has the current value.
 */
export class SendPulse {
    private startMs?: number;

    public send(nowMs: number): void {
        const current = this.startMs === undefined ? 0 : sendPulse((nowMs - this.startMs) / 1000);
        this.startMs = nowMs - sendPulseRiseSeconds(current) * 1000;
    }

    public at(nowMs: number): number {
        return this.startMs === undefined ? 0 : sendPulse((nowMs - this.startMs) / 1000);
    }
}

/**
 * A live wallpaper's own time. It advances only with drawn frames, at most 30 a second, so a pause freezes the
 * frame and `resume` continues from it. A new clock starts at the still, so the first frame after any still
 * condition is the still again.
 */
export class LiveWallpaperClock {
    private elapsedMs = 0;
    private lastFrameMs?: number;

    public constructor(private readonly stillTime: number) {}

    public get time(): number {
        return liveWallpaperTime(this.stillTime, this.elapsedMs / 1000);
    }

    /** The next frame starts from the current one, so time spent paused does not count. */
    public resume(): void {
        this.lastFrameMs = undefined;
    }

    public onFrame(frameMs: number): boolean {
        if (this.lastFrameMs !== undefined) {
            const delta = frameMs - this.lastFrameMs;
            if (delta < FRAME_MS - FRAME_TOLERANCE_MS) return false;
            this.elapsedMs += delta;
        }
        this.lastFrameMs = frameMs;
        return true;
    }
}

const WATCHDOG_WINDOW_MS = 2000;
/** With fewer frames than this in the window, one stray frame would decide the percentile. */
const WATCHDOG_MINIMUM_FRAMES = 10;
/** 1.5 times the 30 fps budget plus the tolerance: 54 ms. */
const WATCHDOG_LIMIT_MS = (1.5 * 1000) / LIVE_WALLPAPER_FPS + FRAME_TOLERANCE_MS;

/**
 * Trips once the 90th percentile of the intervals between drawn frames, over a rolling 2 s window that holds at
 * least ten of them, is over 54 ms in two windows in a row: the first one starts a new window, and the second must
 * come within two window lengths of it. Main-thread work such as a sync or opening a large room rarely lasts that
 * long, a GPU that is too slow does. Each run gets a new instance, so a pause starts again. The first two frames of a
 * run are skipped: the browser finishes the shader around them.
 */
export class FrameWatchdog {
    private frames: { endMs: number; durationMs: number }[] = [];
    private lastFrameMs?: number;
    private framesBeforeWindow = 2;
    private firstSlowWindowMs?: number;
    private tripped = false;

    public get hasTripped(): boolean {
        return this.tripped;
    }

    public onFrame(frameMs: number): boolean {
        if (this.tripped) return true;
        const previous = this.lastFrameMs;
        this.lastFrameMs = frameMs;
        if (this.framesBeforeWindow > 0) {
            this.framesBeforeWindow--;
            return false;
        }
        this.frames.push({ endMs: frameMs, durationMs: frameMs - previous! });
        while (this.frames[0].endMs <= frameMs - WATCHDOG_WINDOW_MS) this.frames.shift();
        if (this.frames.length < WATCHDOG_MINIMUM_FRAMES || this.percentile90() <= WATCHDOG_LIMIT_MS) return false;
        const first = this.firstSlowWindowMs;
        if (first !== undefined && frameMs - first <= 2 * WATCHDOG_WINDOW_MS) {
            this.tripped = true;
        } else {
            this.firstSlowWindowMs = frameMs;
            this.frames = [];
        }
        return this.tripped;
    }

    private percentile90(): number {
        const sorted = this.frames.map((f) => f.durationMs).sort((a, b) => a - b);
        return sorted[Math.ceil(sorted.length * 0.9) - 1];
    }
}

export type WallpaperMotion = "animating" | "paused" | "still";

export interface MotionConditions {
    rendererUnavailable: boolean;
    reducedMotion: boolean;
    slowFrames: boolean;
    hidden: boolean;
    unfocused: boolean;
    offScreen: boolean;
    covered: boolean;
}

/** Anything that asks for the still wins over a pause. */
export function wallpaperMotion(conditions: MotionConditions): WallpaperMotion {
    if (conditions.rendererUnavailable || conditions.reducedMotion || conditions.slowFrames) return "still";
    if (conditions.hidden || conditions.unfocused || conditions.offScreen || conditions.covered) return "paused";
    return "animating";
}
