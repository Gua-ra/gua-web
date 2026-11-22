/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";

import {
    CONTEXT_ATTRIBUTES,
    hasShaderFailed,
    LiveWallpaperRenderer,
    openContext,
    releaseContext,
} from "../../../../src/gua/chatTheme/live/renderer";

const FRAG =
    "precision highp float;\nuniform vec2 u_res;\nvoid main(){gl_FragColor=vec4(gl_FragCoord.xy/u_res,0.0,1.0);}";

/** Records the renderer's calls. Each uniform location is its uniform's name. */
function fakeGl(options: { compiles?: boolean; uniforms?: string[]; parallelAfterPolls?: number } = {}) {
    const calls: unknown[][] = [];
    const sources: string[] = [];
    let polls = 0;
    const loseContext = jest.fn();
    const parallel = { COMPLETION_STATUS_KHR: 9 };
    const record =
        (name: string, result?: unknown) =>
        (...args: unknown[]) => {
            calls.push([name, ...args]);
            return result;
        };
    const gl = {
        VERTEX_SHADER: 1,
        FRAGMENT_SHADER: 2,
        ARRAY_BUFFER: 3,
        STATIC_DRAW: 4,
        FLOAT: 5,
        TRIANGLES: 6,
        COMPILE_STATUS: 7,
        LINK_STATUS: 8,
        drawingBufferWidth: 300,
        drawingBufferHeight: 600,
        createProgram: record("createProgram", {}),
        createShader: (type: number) => ({ type }),
        getExtension: (name: string) =>
            name === "KHR_parallel_shader_compile" && options.parallelAfterPolls !== undefined
                ? parallel
                : name === "WEBGL_lose_context"
                  ? { loseContext }
                  : null,
        shaderSource: (_shader: unknown, source: string) => {
            sources.push(source);
        },
        compileShader: record("compileShader"),
        getShaderParameter: () => options.compiles ?? true,
        getShaderInfoLog: () => "ERROR: 0:1: bad shader",
        attachShader: record("attachShader"),
        detachShader: record("detachShader"),
        deleteShader: record("deleteShader"),
        bindAttribLocation: record("bindAttribLocation"),
        linkProgram: record("linkProgram"),
        getProgramParameter: (_program: unknown, parameter: number) => {
            if (parameter !== parallel.COMPLETION_STATUS_KHR) return options.compiles ?? true;
            calls.push(["poll"]);
            return polls++ >= (options.parallelAfterPolls ?? 0);
        },
        getProgramInfoLog: () => "",
        useProgram: record("useProgram"),
        createBuffer: record("createBuffer", {}),
        bindBuffer: record("bindBuffer"),
        bufferData: record("bufferData"),
        enableVertexAttribArray: record("enableVertexAttribArray"),
        vertexAttribPointer: record("vertexAttribPointer"),
        getUniformLocation: (_program: unknown, name: string) =>
            (options.uniforms ?? ["u_res", "u_time", "u_dark", "u_pulse", "u_tilt", "u_origin", "u_offset"]).includes(
                name,
            )
                ? name
                : null,
        viewport: record("viewport"),
        uniform1f: record("uniform1f"),
        uniform2f: record("uniform2f"),
        drawArrays: record("drawArrays"),
        isContextLost: () => false,
        deleteProgram: record("deleteProgram"),
        deleteBuffer: record("deleteBuffer"),
    };
    return { gl: gl as unknown as WebGLRenderingContext, calls, sources, loseContext };
}

function canvasWith(gl: unknown): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    jest.spyOn(canvas, "getContext").mockReturnValue(gl as RenderingContext);
    return canvas;
}

const create = (gl: WebGLRenderingContext, artwork: "silk" | "ipe" | "boreal" | "lagoon" = "silk") =>
    LiveWallpaperRenderer.create(gl, artwork, FRAG, async () => {});

describe("LiveWallpaperRenderer", () => {
    it("asks for the Lab's context and refuses a software fallback", () => {
        const { gl } = fakeGl();
        const canvas = canvasWith(gl);
        expect(openContext(canvas)).toBe(gl);
        expect(canvas.getContext).toHaveBeenCalledWith("webgl", CONTEXT_ATTRIBUTES);
        expect(CONTEXT_ATTRIBUTES).toEqual(
            expect.objectContaining({ alpha: false, antialias: false, premultipliedAlpha: false }),
        );
        expect(CONTEXT_ATTRIBUTES.failIfMajorPerformanceCaveat).toBe(true);
    });

    it("draws one full-screen triangle with the uniforms of the frame", async () => {
        const { gl, calls } = fakeGl();
        const renderer = (await create(gl))!;
        expect(calls).toContainEqual(["bindAttribLocation", {}, 0, "p"]);
        const triangle = calls.find((call) => call[0] === "bufferData")![2] as Float32Array;
        expect(Array.from(triangle)).toEqual([-1, -1, 3, -1, -1, 3]);

        calls.length = 0;
        renderer.draw({
            resolution: [1290, 2796],
            offset: [0, 1257],
            time: 24.5,
            dark: true,
            pulse: 0.6,
            origin: [10, 20],
        });
        expect(calls).toEqual([
            ["viewport", 0, 0, 300, 600],
            ["uniform2f", "u_res", 1290, 2796],
            ["uniform1f", "u_time", 24.5],
            ["uniform1f", "u_dark", 1],
            ["uniform1f", "u_pulse", 0.6],
            ["uniform2f", "u_tilt", 0, 0],
            ["uniform2f", "u_origin", 10, 20],
            ["uniform2f", "u_offset", 0, 1257],
            ["drawArrays", 6, 0, 3],
        ]);
    });

    it("skips uniforms a shader does not use", async () => {
        const { gl, calls } = fakeGl({ uniforms: ["u_res", "u_offset"] });
        const renderer = (await create(gl))!;
        calls.length = 0;
        renderer.draw({ resolution: [1, 2], offset: [3, 4], time: 0, dark: false, pulse: 0, origin: [0, 0] });
        expect(calls.filter((call) => String(call[0]).startsWith("uniform"))).toEqual([
            ["uniform2f", "u_res", 1, 2],
            ["uniform2f", "u_offset", 3, 4],
        ]);
    });

    it("gives no context without WebGL", () => {
        expect(openContext(canvasWith(null))).toBeNull();
        expect(hasShaderFailed("ipe")).toBe(false);
    });

    it("keeps an artwork whose shader fails still for the session, logged once", async () => {
        const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
        expect(await create(fakeGl({ compiles: false }).gl, "boreal")).toBeNull();
        expect(hasShaderFailed("boreal")).toBe(true);
        expect(await create(fakeGl().gl, "boreal")).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("ERROR: 0:1: bad shader");
        expect(hasShaderFailed("lagoon")).toBe(false);
    });

    it("compiles the shader with its frame offset", async () => {
        const { gl, sources } = fakeGl();
        await create(gl, "lagoon");
        expect(sources[1]).toContain("uniform vec2 u_offset;");
        expect(sources[1]).toContain("(gl_FragCoord+vec4(u_offset,0.0,0.0)).xy");
    });

    it("waits for a parallel compile a frame at a time before reading the result", async () => {
        const { gl, calls } = fakeGl({ parallelAfterPolls: 2 });
        const nextFrame = jest.fn(async () => {});
        expect(await LiveWallpaperRenderer.create(gl, "silk", FRAG, nextFrame)).not.toBeNull();
        expect(nextFrame).toHaveBeenCalledTimes(2);
        expect(calls.filter((call) => call[0] === "poll")).toHaveLength(3);
    });

    it("gives up a parallel compile when the context is lost meanwhile", async () => {
        const { gl } = fakeGl({ parallelAfterPolls: 5 });
        let lost = false;
        gl.isContextLost = () => lost;
        const renderer = LiveWallpaperRenderer.create(gl, "ipe", FRAG, async () => {
            lost = true;
        });
        expect(await renderer).toBeNull();
        expect(hasShaderFailed("ipe")).toBe(false);
    });

    it("frees its shaders once linked, its program when disposed, and the context when released", async () => {
        const { gl, calls, loseContext } = fakeGl();
        const renderer = (await create(gl))!;
        expect(calls.filter((call) => call[0] === "deleteShader")).toHaveLength(2);
        expect(calls.filter((call) => call[0] === "detachShader")).toHaveLength(2);
        renderer.dispose();
        expect(calls.map((call) => call[0])).toEqual(expect.arrayContaining(["deleteProgram", "deleteBuffer"]));
        expect(loseContext).not.toHaveBeenCalled();
        releaseContext(gl);
        expect(loseContext).toHaveBeenCalled();
    });
});
