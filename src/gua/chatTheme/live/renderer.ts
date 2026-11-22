/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";

import { type ArtworkId } from "../model/artworks";
import { OFFSET_UNIFORM, withFrameOffset } from "./shaderSource";

const VERTEX_SHADER = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";
/** One triangle that covers the whole viewport, as the Lab, the bake and the goldens draw. */
const FULL_SCREEN_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);

/**
 * The Lab's context, except that the drawing buffer is not preserved, which changes no pixel. A software fallback
 * would be too slow to animate, so the browser is asked to refuse one.
 */
export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: true,
};

/** An artwork whose shader failed to build stays still for the rest of the session. */
const failedArtworks = new Set<ArtworkId>();

export function hasShaderFailed(artwork: ArtworkId): boolean {
    return failedArtworks.has(artwork);
}

export interface LiveUniforms {
    resolution: [number, number];
    offset: [number, number];
    time: number;
    dark: boolean;
    pulse: number;
    origin: [number, number];
}

const UNIFORM_NAMES = ["u_res", "u_time", "u_dark", "u_pulse", "u_tilt", "u_origin", OFFSET_UNIFORM] as const;

type UniformLocations = Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;

export class LiveWallpaperRenderer {
    private constructor(
        private readonly gl: WebGLRenderingContext,
        private readonly program: WebGLProgram,
        private readonly buffer: WebGLBuffer | null,
        private readonly uniforms: UniformLocations,
    ) {}

    /** Null when the browser has no usable WebGL or the shader does not build. */
    public static create(canvas: HTMLCanvasElement, artwork: ArtworkId, frag: string): LiveWallpaperRenderer | null {
        if (failedArtworks.has(artwork)) return null;
        const gl = canvas.getContext("webgl", CONTEXT_ATTRIBUTES);
        if (!gl) return null;

        const program = buildProgram(gl, withFrameOffset(frag));
        if (typeof program === "string") {
            if (!gl.isContextLost()) {
                failedArtworks.add(artwork);
                logger.warn(`Live wallpaper ${artwork} stays still for this session: ${program}`);
            }
            return null;
        }

        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, FULL_SCREEN_TRIANGLE, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        const uniforms = Object.fromEntries(
            UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
        ) as UniformLocations;
        return new LiveWallpaperRenderer(gl, program, buffer, uniforms);
    }

    public draw(u: LiveUniforms): void {
        const { gl, uniforms } = this;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        if (uniforms.u_res) gl.uniform2f(uniforms.u_res, u.resolution[0], u.resolution[1]);
        if (uniforms.u_time) gl.uniform1f(uniforms.u_time, u.time);
        if (uniforms.u_dark) gl.uniform1f(uniforms.u_dark, u.dark ? 1 : 0);
        if (uniforms.u_pulse) gl.uniform1f(uniforms.u_pulse, u.pulse);
        if (uniforms.u_tilt) gl.uniform2f(uniforms.u_tilt, 0, 0);
        if (uniforms.u_origin) gl.uniform2f(uniforms.u_origin, u.origin[0], u.origin[1]);
        if (uniforms[OFFSET_UNIFORM]) gl.uniform2f(uniforms[OFFSET_UNIFORM], u.offset[0], u.offset[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** Keeps the context: React's development double mount creates a renderer again on the same canvas. */
    public dispose(): void {
        this.gl.deleteBuffer(this.buffer);
        this.gl.deleteProgram(this.program);
    }
}

/** The program, or why it failed. */
function buildProgram(gl: WebGLRenderingContext, frag: string): WebGLProgram | string {
    const program = gl.createProgram();
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, frag);
    if (!program || typeof vertex === "string" || typeof fragment === "string") {
        return typeof vertex === "string" ? vertex : typeof fragment === "string" ? fragment : "no program";
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "p");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return gl.getProgramInfoLog(program) ?? "link failed";
    return program;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | string {
    const shader = gl.createShader(type);
    if (!shader) return "no shader";
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return gl.getShaderInfoLog(shader) ?? "compile failed";
    return shader;
}
