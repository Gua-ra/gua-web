/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { diagonalAngle, presetBackground } from "../../../../src/gua/chatTheme/model/presetFill";
import { isGradient, PRESET_IDS, presetFill, SOLIDS } from "../../../../src/gua/chatTheme/model/presets";

/** Where a CSS gradient line at this angle starts and ends in a w by h box. */
function cssGradientLine(angleDeg: number, w: number, h: number): [number, number, number, number] {
    const a = (angleDeg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    return [w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half];
}

describe("preset fills", () => {
    it.each([
        [100, 100],
        [390, 844],
        [1200, 300],
    ])("runs a diagonal from the top-left to the bottom-right corner of a %d by %d box", (w, h) => {
        const [x0, y0, x1, y1] = cssGradientLine(diagonalAngle(w, h), w, h);
        expect(x0).toBeCloseTo(0, 9);
        expect(y0).toBeCloseTo(0, 9);
        expect(x1).toBeCloseTo(w, 9);
        expect(y1).toBeCloseTo(h, 9);
    });

    it("draws a diagonal preset at the box's angle", () => {
        expect(presetBackground(presetFill("ocean", false), 100, 100)).toBe(
            "linear-gradient(135deg, #A4D5D9 0%, #A7C6EB 100%)",
        );
    });

    it("draws vertical presets top to bottom", () => {
        expect(presetBackground(presetFill("sunset", true), 10, 20)).toBe(
            "linear-gradient(180deg, #22100C 0%, #220D1C 50%, #161029 100%)",
        );
    });

    it("sizes the aurora glows on the longest side, glow B on top", () => {
        expect(presetBackground(presetFill("aurora", false), 400, 800)).toBe(
            "radial-gradient(circle 520px at 75% 80%, #93CBCF, #93CBCF00), " +
                "radial-gradient(circle 600px at 30% 25%, #8FCDAB, #8FCDAB00), #B2D8C2",
        );
    });

    it("counts every preset but the solids as a gradient, which takes grain", () => {
        for (const preset of PRESET_IDS) {
            expect(isGradient(presetFill(preset, false))).toBe(!SOLIDS.includes(preset));
        }
        expect(presetBackground(presetFill("graphite", true), 1, 1)).toBe("#000000");
    });
});
