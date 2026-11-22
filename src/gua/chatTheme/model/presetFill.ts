/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type GradientStop, type PresetFill } from "./presets";

const stopList = (stops: GradientStop[]): string => stops.map(({ colour, at }) => `${colour} ${at * 100}%`).join(", ");

/** `#RRGGBB` at alpha 0, so a glow fades to its own colour rather than towards black. */
const transparent = (hex: string): string => `${hex}00`;

/**
 * The CSS angle for a corner-to-corner gradient with isolines perpendicular to it, as the apps draw a diagonal.
 * `135deg` and `to bottom right` only match it on a square.
 */
export function diagonalAngle(width: number, height: number): number {
    if (width <= 0 || height <= 0) return 135;
    return 180 - (Math.atan(width / height) * 180) / Math.PI;
}

export function presetBackground(fill: PresetFill, width: number, height: number): string {
    switch (fill.type) {
        case "solid":
            return fill.colour;
        case "vertical":
            return `linear-gradient(180deg, ${stopList(fill.stops)})`;
        case "diagonal":
            return `linear-gradient(${diagonalAngle(width, height)}deg, ${stopList(fill.stops)})`;
        case "aurora": {
            const longest = Math.max(width, height);
            const glows = fill.glows
                .map(
                    (glow) =>
                        `radial-gradient(circle ${glow.radius * longest}px at ${glow.x * 100}% ${glow.y * 100}%, ` +
                        `${glow.colour}, ${transparent(glow.colour)})`,
                )
                .reverse();
            return [...glows, fill.base].join(", ");
        }
    }
}
