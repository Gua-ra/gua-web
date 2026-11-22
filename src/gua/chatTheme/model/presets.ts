/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/** Append only: every app build knows the first ten, and every artwork's fallback is one of them. */
export const PRESET_IDS = [
    "aurora",
    "mint",
    "sky",
    "sand",
    "blush",
    "lavender",
    "graphite",
    "sunset",
    "ocean",
    "night",
    "dawn",
    "forest",
    "dusk",
    "citrus",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export const ORIGINAL_TEN: readonly PresetId[] = PRESET_IDS.slice(0, 10);
export const SOLIDS: readonly PresetId[] = ["mint", "sky", "sand", "blush", "lavender", "graphite"];
export const GRADIENTS: readonly PresetId[] = [
    "aurora",
    "sunset",
    "ocean",
    "night",
    "dawn",
    "forest",
    "dusk",
    "citrus",
];

export interface GradientStop {
    colour: string;
    at: number;
}

/** Points are unit coordinates of the frame from its top-left corner, never mirrored for right-to-left layouts. */
export type PresetFill =
    | { type: "solid"; colour: string }
    | { type: "vertical"; stops: GradientStop[] }
    | { type: "diagonal"; stops: GradientStop[] }
    | { type: "aurora"; base: string; glows: { colour: string; x: number; y: number; radius: number }[] };

const stops = (...pairs: [string, number][]): GradientStop[] => pairs.map(([colour, at]) => ({ colour, at }));

/** Glow radii are fractions of the frame's longest side. */
const aurora = (base: string, glowA: string, glowB: string): PresetFill => ({
    type: "aurora",
    base,
    glows: [
        { colour: glowA, x: 0.3, y: 0.25, radius: 0.75 },
        { colour: glowB, x: 0.75, y: 0.8, radius: 0.65 },
    ],
});

const FILLS: Record<PresetId, { light: PresetFill; dark: PresetFill }> = {
    aurora: { light: aurora("#B2D8C2", "#8FCDAB", "#93CBCF"), dark: aurora("#030D08", "#061B11", "#05181A") },
    mint: { light: { type: "solid", colour: "#ADD7BF" }, dark: { type: "solid", colour: "#08190F" } },
    sky: { light: { type: "solid", colour: "#B6D1EB" }, dark: { type: "solid", colour: "#0A1524" } },
    sand: { light: { type: "solid", colour: "#DCC9A9" }, dark: { type: "solid", colour: "#19130B" } },
    blush: { light: { type: "solid", colour: "#E8C3CA" }, dark: { type: "solid", colour: "#200F17" } },
    lavender: { light: { type: "solid", colour: "#D0C6EB" }, dark: { type: "solid", colour: "#151125" } },
    graphite: { light: { type: "solid", colour: "#C5CAD3" }, dark: { type: "solid", colour: "#000000" } },
    sunset: {
        light: { type: "vertical", stops: stops(["#F0C6A6", 0], ["#EAB5C2", 0.5], ["#CBB5E4", 1]) },
        dark: { type: "vertical", stops: stops(["#22100C", 0], ["#220D1C", 0.5], ["#161029", 1]) },
    },
    ocean: {
        light: { type: "diagonal", stops: stops(["#A4D5D9", 0], ["#A7C6EB", 1]) },
        dark: { type: "diagonal", stops: stops(["#05181A", 0], ["#09132A", 1]) },
    },
    night: {
        light: { type: "vertical", stops: stops(["#C1C6EC", 0], ["#D4C0E6", 1]) },
        dark: { type: "vertical", stops: stops(["#0A0D20", 0], ["#170C22", 1]) },
    },
    dawn: {
        light: { type: "vertical", stops: stops(["#F6D9BF", 0], ["#C9DDF0", 1]) },
        dark: { type: "vertical", stops: stops(["#1E140C", 0], ["#0B1626", 1]) },
    },
    forest: {
        light: { type: "diagonal", stops: stops(["#B9D8B0", 0], ["#9CC7B4", 1]) },
        dark: { type: "diagonal", stops: stops(["#07140A", 0], ["#0A1A14", 1]) },
    },
    dusk: {
        light: { type: "vertical", stops: stops(["#D9C2EA", 0], ["#F1C9B8", 1]) },
        dark: { type: "vertical", stops: stops(["#140C22", 0], ["#21120C", 1]) },
    },
    citrus: {
        light: { type: "diagonal", stops: stops(["#F2E6A8", 0], ["#BFE3B4", 1]) },
        dark: { type: "diagonal", stops: stops(["#1A1606", 0], ["#0B1A0C", 1]) },
    },
};

export function isPresetId(value: unknown): value is PresetId {
    return typeof value === "string" && (PRESET_IDS as readonly string[]).includes(value);
}

export function presetFill(preset: PresetId, dark: boolean): PresetFill {
    return dark ? FILLS[preset].dark : FILLS[preset].light;
}

export function isGradient(fill: PresetFill): boolean {
    return fill.type !== "solid";
}
