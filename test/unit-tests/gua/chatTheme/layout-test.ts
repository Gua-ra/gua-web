/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    aspectFill,
    liveFrame,
    liveRenderScale,
    pulseOrigin,
    type Rect,
} from "../../../../src/gua/chatTheme/model/layout";

function expectRect(actual: Rect, expected: Rect): void {
    for (const key of ["x", "y", "width", "height"] as const) expect(actual[key]).toBeCloseTo(expected[key], 9);
}

describe("wallpaper layout", () => {
    it("covers the frame and aligns the overflow", () => {
        expectRect(aspectFill(100, 100, 200, 100, 0.5, 0.5), { x: -50, y: 0, width: 200, height: 100 });
        expectRect(aspectFill(100, 100, 200, 100, 1, 0), { x: -100, y: 0, width: 200, height: 100 });
        expectRect(aspectFill(100, 300, 100, 100, 0, 0.25), { x: 0, y: 0, width: 300, height: 300 });
        expectRect(aspectFill(200, 100, 100, 200, 0.5, 0.72), { x: 0, y: -216, width: 200, height: 400 });
    });

    it("never renders below one pixel per CSS pixel", () => {
        expect(liveRenderScale(1)).toBe(1);
        expect(liveRenderScale(2)).toBe(1);
        expect(liveRenderScale(3)).toBe(1.5);
    });

    it("maps a wide view onto the still's frame in whole pixels", () => {
        const live = liveFrame(1290, 1000, 0.5, 0.3, 1);
        expect([live.canvasWidth, live.canvasHeight]).toEqual([1290, 1000]);
        expect(live.resolution).toEqual([1290, 2796]);
        expect(live.frame.y).toBeCloseTo(-538.8, 9);
        expect(live.offset[0]).toBe(0);
        expect(live.offset[1]).toBe(1257);
    });

    it("maps a tall view with a horizontal crop", () => {
        const live = liveFrame(645, 2796, 1, 0, 2);
        expect([live.canvasWidth, live.canvasHeight]).toEqual([1290, 5592]);
        expect(live.resolution).toEqual([2580, 5592]);
        expect(live.offset[0]).toBe(1290);
        expect(live.offset[1]).toBe(0);
    });

    it("places the pulse on the visible chat, y from the bottom", () => {
        const live = liveFrame(1290, 2796, 0.5, 0.5, 1);
        const [x, y] = pulseOrigin(live, { left: 0, right: 1290, top: 0, bottom: 2796 });
        expect(x).toBeCloseTo(1290 * 0.83, 9);
        expect(y).toBeCloseTo(2796 * 0.113, 9);
        const [columnX, aboveComposer] = pulseOrigin(live, { left: 90, right: 1200, top: 64, bottom: 2596 });
        expect(columnX).toBeCloseTo(90 + 1110 * 0.83, 9);
        expect(aboveComposer).toBeCloseTo(200 + (2596 - 64) * 0.113, 9);
    });
});
