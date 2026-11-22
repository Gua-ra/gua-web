/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

export const OFFSET_UNIFORM = "u_offset";

/**
 * Lets a canvas the size of the view draw its part of the still's larger frame: every `gl_FragCoord` read is moved
 * by `u_offset`. With whole-pixel offsets each fragment sees exactly the coordinate it has in the full frame.
 */
export function withFrameOffset(frag: string): string {
    const precision = /^precision\s+\w+\s+float\s*;[^\n]*\n/m;
    const match = precision.exec(frag);
    if (!match) throw new Error("Live wallpaper shader has no float precision statement");
    const at = match.index + match[0].length;
    const body = frag.slice(at).replace(/\bgl_FragCoord\b/g, `(gl_FragCoord+vec4(${OFFSET_UNIFORM},0.0,0.0))`);
    return `${frag.slice(0, at)}uniform vec2 ${OFFSET_UNIFORM};\n${body}`;
}
