/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { act, render } from "jest-matrix-react";
import { logger } from "matrix-js-sdk/src/logger";

import { LiveWallpaperCanvas } from "../../../../src/gua/chatTheme/live/LiveWallpaperCanvas";
import { reportSlowFrames } from "../../../../src/gua/chatTheme/live/useMotionConditions";
import { getArtwork } from "../../../../src/gua/chatTheme/model/artworks";
import Modal from "../../../../src/Modal";

jest.mock("../../../../src/gua/chatTheme/live/liveShaders", () => ({
    LIVE_SHADERS: new Map([
        ["silk", async () => ({ default: "precision highp float;\nvoid main(){gl_FragColor=vec4(1.0);}" })],
    ]),
}));

const silk = getArtwork("silk");

function fakeGl() {
    const draws: { width: number; height: number }[] = [];
    const loseContext = jest.fn();
    const canvases: HTMLCanvasElement[] = [];
    const nothing = (): void => {};
    const gl = {
        drawingBufferWidth: 0,
        drawingBufferHeight: 0,
        createProgram: () => ({}),
        createShader: () => ({}),
        createBuffer: () => ({}),
        getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null),
        getProgramParameter: () => true,
        getShaderParameter: () => true,
        getUniformLocation: () => null,
        isContextLost: () => false,
        drawArrays: () => draws.push({ width: canvases.at(-1)!.width, height: canvases.at(-1)!.height }),
        ...Object.fromEntries(
            [
                "shaderSource",
                "compileShader",
                "attachShader",
                "detachShader",
                "deleteShader",
                "bindAttribLocation",
                "linkProgram",
                "useProgram",
                "bindBuffer",
                "bufferData",
                "enableVertexAttribArray",
                "vertexAttribPointer",
                "viewport",
                "uniform1f",
                "uniform2f",
                "deleteProgram",
                "deleteBuffer",
            ].map((name) => [name, nothing]),
        ),
    };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
        canvases.push(this);
        return gl as unknown as RenderingContext;
    });
    return { draws, loseContext };
}

describe("LiveWallpaperCanvas", () => {
    let frames: Map<number, FrameRequestCallback>;
    let nextFrame: number;
    let reducedMotion: boolean;

    function runFrame(timeMs: number): void {
        const pending = [...frames.values()];
        frames.clear();
        act(() => pending.forEach((callback) => callback(timeMs)));
    }

    const canvas = (container: HTMLElement): HTMLCanvasElement | null => container.querySelector("canvas");

    beforeEach(() => {
        frames = new Map();
        nextFrame = 1;
        reducedMotion = false;
        jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            frames.set(nextFrame, callback);
            return nextFrame++;
        });
        jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => frames.delete(id));
        jest.spyOn(document, "hasFocus").mockReturnValue(true);
        window.matchMedia = jest.fn((query: string) => ({
            matches: reducedMotion && query.includes("reduce"),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => jest.restoreAllMocks());

    async function mount(props: Partial<React.ComponentProps<typeof LiveWallpaperCanvas>> = {}) {
        const result = render(
            <LiveWallpaperCanvas artwork={silk} dark={false} width={400} height={300} inDialog={true} {...props} />,
        );
        await act(async () => {});
        return result;
    }

    it("shows the canvas once it has drawn, over the still", async () => {
        const { draws } = fakeGl();
        const { container } = await mount();
        expect(canvas(container)!.style.opacity).toBe("0");
        runFrame(1000);
        expect(draws).toHaveLength(1);
        expect(canvas(container)!.style.opacity).toBe("1");
    });

    it("keeps the still under reduced motion", async () => {
        reducedMotion = true;
        const { draws } = fakeGl();
        const { container } = await mount();
        runFrame(1000);
        expect(draws).toHaveLength(0);
        expect(frames.size).toBe(0);
        expect(canvas(container)!.style.opacity).toBe("0");
    });

    it("redraws in the same commit when its size changes, so a cleared canvas never shows", async () => {
        const { draws } = fakeGl();
        const { rerender, container } = await mount();
        runFrame(1000);
        rerender(<LiveWallpaperCanvas artwork={silk} dark={false} width={500} height={300} inDialog={true} />);
        expect(draws.at(-1)).toEqual({ width: 500, height: 300 });
        expect(canvas(container)!.width).toBe(500);
    });

    it("pauses in the timeline while a dialog is open", async () => {
        jest.spyOn(Modal, "hasDialogs").mockReturnValue(true);
        const { draws } = fakeGl();
        await mount({ inDialog: false });
        runFrame(1000);
        expect(draws).toHaveLength(0);
        expect(frames.size).toBe(0);
    });

    it("holds its frame while frozen", async () => {
        const { draws } = fakeGl();
        const { rerender } = await mount();
        runFrame(1000);
        rerender(<LiveWallpaperCanvas artwork={silk} dark={false} width={400} height={300} inDialog={true} frozen />);
        const drawn = draws.length;
        runFrame(1100);
        expect(draws).toHaveLength(drawn);
        expect(frames.size).toBe(0);
    });

    it("falls back to the still for good when the context is lost", async () => {
        const { draws } = fakeGl();
        const { container } = await mount();
        runFrame(1000);
        act(() => {
            canvas(container)!.dispatchEvent(new Event("webglcontextlost"));
        });
        expect(canvas(container)!.style.opacity).toBe("0");
        runFrame(1100);
        expect(draws).toHaveLength(1);
    });

    it("releases its context and removes its canvas when it goes", async () => {
        const { loseContext } = fakeGl();
        const { container, unmount } = await mount();
        const element = canvas(container)!;
        unmount();
        expect(loseContext).toHaveBeenCalled();
        expect(element.isConnected).toBe(false);
    });

    it("reports its motion, and every wallpaper shows its still for a while after slow frames", async () => {
        jest.useFakeTimers({ doNotFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
        try {
            fakeGl();
            jest.spyOn(logger, "warn").mockImplementation(() => {});
            const onMotion = jest.fn();
            const { container } = await mount({ onMotion });
            expect(onMotion).toHaveBeenLastCalledWith("animating");
            act(() => reportSlowFrames());
            expect(onMotion).toHaveBeenLastCalledWith("still");
            expect(canvas(container)!.style.opacity).toBe("0");
            act(() => jest.advanceTimersByTime(10 * 60 * 1000));
            expect(onMotion).toHaveBeenLastCalledWith("animating");
        } finally {
            jest.useRealTimers();
        }
    });
});
