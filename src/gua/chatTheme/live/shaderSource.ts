/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

export const OFFSET_UNIFORM = "u_offset";

/**
 * Lets a view-sized canvas draw its part of the still's larger frame by moving every `gl_FragCoord` read by
 * `u_offset`. Whole-pixel offsets give each fragment exactly its full-frame coordinate.
 */
export function withFrameOffset(frag: string): string {
    const precision = /^precision\s+\w+\s+float\s*;[^\n]*\n/m;
    const match = precision.exec(frag);
    if (!match) throw new Error("Live wallpaper shader has no float precision statement");
    const at = match.index + match[0].length;
    const body = frag.slice(at).replace(/\bgl_FragCoord\b/g, `(gl_FragCoord+vec4(${OFFSET_UNIFORM},0.0,0.0))`);
    return `${frag.slice(0, at)}uniform vec2 ${OFFSET_UNIFORM};\n${body}`;
}
