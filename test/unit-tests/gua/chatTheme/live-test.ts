/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import fixtures from "./fixtures/live-wallpaper-motion-fixtures.json";
import {
    FrameWatchdog,
    LiveWallpaperClock,
    liveWallpaperTime,
    SendPulse,
    sendPulse,
    wallpaperMotion,
    type MotionConditions,
} from "../../../../src/gua/chatTheme/live/timing";

const NONE: MotionConditions = {
    rendererUnavailable: false,
    reducedMotion: false,
    slowFrames: false,
    hidden: false,
    unfocused: false,
    offScreen: false,
    covered: false,
};

function feed(watchdog: FrameWatchdog, intervalMs: number, count: number, startMs = 0): boolean {
    let tripped = false;
    for (let i = 0; i < count; i++) tripped = watchdog.onFrame(startMs + i * intervalMs);
    return tripped;
}

describe("live wallpaper timing", () => {
    it.each(fixtures.pulse.cases.map((c) => [c.name, c] as const))(
        "plays the shared pulse case %s",
        (_name, fixture) => {
            const pulse = new SendPulse();
            let sent = 0;
            for (const [time, expected] of fixture.samples) {
                while (sent < fixture.sends.length && fixture.sends[sent] <= time)
                    pulse.send(fixture.sends[sent++] * 1000);
                expect(Math.abs(pulse.at(time * 1000) - expected)).toBeLessThan(1e-9);
            }
            expect(sent).toBe(fixture.sends.length);
        },
    );

    it("uses the shared envelope", () => {
        expect([fixtures.pulse.rise, fixtures.pulse.decay, fixtures.pulse.end]).toEqual([0.25, 0.9, 4.2]);
        expect(sendPulse(-0.01)).toBe(0);
        expect(sendPulse(0.25)).toBe(1);
        expect(sendPulse(4.21)).toBe(0);
    });

    it("starts at the still and wraps every 30 minutes", () => {
        expect(liveWallpaperTime(151, 0)).toBe(151);
        expect(liveWallpaperTime(151, 1700)).toBe(51);
    });

    it("draws at most 30 frames a second, and a paused clock does not advance", () => {
        const clock = new LiveWallpaperClock(24);
        expect(clock.onFrame(1000)).toBe(true);
        expect(clock.time).toBe(24);
        expect(clock.onFrame(1016.7)).toBe(false);
        expect(clock.onFrame(1029.4)).toBe(true);
        expect(clock.time).toBeCloseTo(24.0294, 9);
        clock.resume();
        expect(clock.onFrame(9000)).toBe(true);
        expect(clock.time).toBeCloseTo(24.0294, 9);
        expect(clock.onFrame(9029.2)).toBe(false);
    });

    it("trips when the 90th percentile frame is over 54 ms", () => {
        expect(feed(new FrameWatchdog(), 53.999, 40)).toBe(false);
        expect(feed(new FrameWatchdog(), 54, 40)).toBe(false);
        expect(feed(new FrameWatchdog(), 54.001, 40)).toBe(true);
    });

    it("needs ten frames in its window and skips the first two of a run", () => {
        const watchdog = new FrameWatchdog();
        expect(watchdog.onFrame(0)).toBe(false);
        expect(watchdog.onFrame(5000)).toBe(false);
        expect(feed(watchdog, 100, 9, 5100)).toBe(false);
        expect(watchdog.onFrame(6000)).toBe(true);
    });

    it("lets a few slow frames among two seconds of smooth ones pass", () => {
        const watchdog = new FrameWatchdog();
        feed(watchdog, 33, 62);
        expect(feed(watchdog, 100, 5, 2113)).toBe(false);
        expect(watchdog.onFrame(2613)).toBe(true);
    });

    it("prefers the still over a pause", () => {
        expect(wallpaperMotion(NONE)).toBe("animating");
        expect(wallpaperMotion({ ...NONE, covered: true })).toBe("paused");
        expect(wallpaperMotion({ ...NONE, hidden: true, reducedMotion: true })).toBe("still");
        expect(wallpaperMotion({ ...NONE, offScreen: true, slowFrames: true })).toBe("still");
        expect(wallpaperMotion({ ...NONE, unfocused: true, rendererUnavailable: true })).toBe("still");
    });
});
