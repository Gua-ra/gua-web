/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/** Outgoing bubble colours in picker order. `standard` is the stock bubble and is never written. */
export const BUBBLE_IDS = [
    "standard",
    "green",
    "teal",
    "blue",
    "purple",
    "pink",
    "orange",
    "yellow",
    "graphite",
] as const;

export type BubbleId = (typeof BUBBLE_IDS)[number];

/** Also used with increased contrast: they already give stock text the stock bubble's contrast. */
export const BUBBLE_COLOURS: Record<Exclude<BubbleId, "standard">, { light: string; dark: string }> = {
    green: { light: "#D9F4DD", dark: "#173826" },
    teal: { light: "#D3F1EC", dark: "#123A38" },
    blue: { light: "#DCE8FA", dark: "#18304F" },
    purple: { light: "#E8E0F8", dark: "#30264D" },
    pink: { light: "#F9DDE8", dark: "#4A1F36" },
    orange: { light: "#FBE4D0", dark: "#4A2B14" },
    yellow: { light: "#F7F0CC", dark: "#3F3612" },
    graphite: { light: "#E1E4E9", dark: "#2F333A" },
};

export function isBubbleId(value: unknown): value is BubbleId {
    return typeof value === "string" && (BUBBLE_IDS as readonly string[]).includes(value);
}

export function bubbleColour(bubble: BubbleId, dark: boolean): string | undefined {
    if (bubble === "standard") return undefined;
    return dark ? BUBBLE_COLOURS[bubble].dark : BUBBLE_COLOURS[bubble].light;
}
