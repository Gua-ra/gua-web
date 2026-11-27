/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import fs from "node:fs";
import path from "node:path";

import { withFrameOffset } from "../../../../src/gua/chatTheme/live/shaderSource";

const SHADERS = path.resolve(__dirname, "../../../../src/gua/chatTheme/live/shaders");
const files = fs.readdirSync(SHADERS).filter((f) => f.endsWith(".frag"));
const HEADER =
    "/*\nCopyright 2026 Gua\n\nSPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only\n" +
    "Please see LICENSE files in the repository root for full details.\n\n" +
    'hash12 and hash22 are "Hash without Sine" by David Hoskins, used under the MIT licence; see THIRD_PARTY_NOTICES.md.\n*/\n\n';

describe("live wallpaper shader source", () => {
    it.each(files)("%s declares the uniform contract", (file) => {
        const frag = fs.readFileSync(path.join(SHADERS, file), "utf8");
        expect(frag.startsWith(`${HEADER}precision highp float;\n`)).toBe(true);
        for (const uniform of [
            "vec2 u_res",
            "float u_time",
            "float u_dark",
            "float u_pulse",
            "vec2 u_tilt",
            "vec2 u_origin",
        ]) {
            expect(frag).toContain(`uniform ${uniform};`);
        }
        expect(frag).toContain("gl_FragColor");
    });

    it.each(files)("%s only moves its fragment coordinates", (file) => {
        const frag = fs.readFileSync(path.join(SHADERS, file), "utf8");
        const moved = withFrameOffset(frag);
        expect(moved.startsWith(`${HEADER}precision highp float;\nuniform vec2 u_offset;\n`)).toBe(true);
        expect(moved).not.toMatch(/gl_FragCoord(?!\+vec4\(u_offset,0\.0,0\.0\)\))/);
        const restored = moved
            .replace("uniform vec2 u_offset;\n", "")
            .replaceAll("(gl_FragCoord+vec4(u_offset,0.0,0.0))", "gl_FragCoord");
        expect(restored).toBe(frag);
    });

    it("refuses a shader without a precision statement", () => {
        expect(() => withFrameOffset("void main(){gl_FragColor=vec4(1.0);}")).toThrow();
    });
});
