/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "jest-matrix-react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { PhotoLayer } from "../../../../src/gua/chatTheme/render/PhotoLayer";
import { type PhotoWallpaper } from "../../../../src/gua/chatTheme/model/types";
import { ChatPhotoEditor } from "../../../../src/gua/chatTheme/ui/ChatPhotoEditor";
import { type PreparedPhoto } from "../../../../src/gua/chatTheme/ui/photo/preparePhoto";
import { useThemeScreen } from "../../../../src/gua/chatTheme/ui/useThemeScreen";
import { stubClient, withClientContextRenderOptions } from "../../../test-utils";

const BLURHASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

function fakeBitmap(width: number, height: number): ImageBitmap {
    return { width, height, close: jest.fn() } as unknown as ImageBitmap;
}

const RealImage = window.Image;

/** Reports the size every image's header gives. */
class FakeImage {
    public static size = { width: 200, height: 100 };
    public naturalWidth = 0;
    public naturalHeight = 0;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public set src(_url: string) {
        queueMicrotask(() => {
            this.naturalWidth = FakeImage.size.width;
            this.naturalHeight = FakeImage.size.height;
            this.onload?.();
        });
    }
}

/** jsdom has no pointer events, and a plain Event would carry no coordinates. */
class FakePointerEvent extends MouseEvent {
    public readonly pointerId: number;
    public constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
    }
}

const photo: PhotoWallpaper = {
    url: "mxc://gua.global/photo",
    mimetype: "image/jpeg",
    w: 200,
    h: 100,
    size: 1000,
    blurhash: BLURHASH,
    dim: 35,
    alignX: 500,
    alignY: 500,
};

describe("photo wallpaper layer", () => {
    let client: MatrixClient;
    let finishDownload: (ok: boolean) => void;

    beforeAll(() => {
        window.Image = FakeImage as unknown as typeof Image;
        URL.createObjectURL = jest.fn(() => "blob:photo");
        URL.revokeObjectURL = jest.fn();
    });

    afterAll(() => {
        window.Image = RealImage;
    });

    beforeEach(() => {
        client = stubClient();
        global.fetch = jest.fn(
            () =>
                new Promise((resolve, reject) => {
                    finishDownload = (ok) =>
                        ok
                            ? resolve({
                                  ok: true,
                                  status: 200,
                                  headers: { get: () => null },
                                  body: null,
                                  blob: async () => new Blob([new Uint8Array(1000)]),
                              } as unknown as Response)
                            : reject(new Error("offline"));
                }),
        );
        window.createImageBitmap = jest.fn(async () => fakeBitmap(200, 100)) as typeof window.createImageBitmap;
        jest.spyOn(CanvasRenderingContext2D.prototype, "drawImage").mockImplementation(() => {});
        jest.spyOn(logger, "warn").mockImplementation(() => {});
    });

    afterEach(() => jest.restoreAllMocks());

    const renderLayer = (dark: boolean) =>
        render(<PhotoLayer photo={photo} size={{ width: 100, height: 100 }} dark={dark} increasedContrast={false} />);

    it("shows the blurhash until the photo loads, then only the photo", async () => {
        const { container } = renderLayer(false);
        expect(container.querySelector("canvas")).toHaveAttribute("width", "32");
        await act(async () => finishDownload(true));
        await waitFor(() => expect(container.querySelector("canvas")).toHaveAttribute("width", "200"));
        expect(container.querySelectorAll("canvas")).toHaveLength(1);
        expect(container.querySelector("canvas")!.style.width).toBe("200px");
        expect(container.querySelector("canvas")!.style.left).toBe("-50px");
    });

    it("dims only in dark appearance", async () => {
        const light = renderLayer(false);
        expect(light.container.querySelector(".mx_GuaWallpaper_scrim")).toBeNull();
        light.unmount();
        const { container } = renderLayer(true);
        expect(container.querySelector<HTMLElement>(".mx_GuaWallpaper_scrim")!.style.opacity).toBe("0.35");
    });

    it("shows neither the photo nor the dim after a failure", async () => {
        const { container } = renderLayer(true);
        await act(async () => finishDownload(false));
        await waitFor(() => expect(container.querySelector(".mx_GuaWallpaper_scrim")).toBeNull());
        expect(container.querySelector("canvas")).toBeNull();
    });

    describe("editor", () => {
        let prepared: PreparedPhoto;
        let onSaved: jest.Mock;

        function Editor(): React.JSX.Element {
            return (
                <ChatPhotoEditor
                    screen={useThemeScreen("default")}
                    photo={prepared}
                    onBack={jest.fn()}
                    onSaved={onSaved}
                />
            );
        }

        beforeEach(() => {
            prepared = {
                blob: new Blob([new Uint8Array(500)]),
                width: 2000,
                height: 1000,
                blurhash: BLURHASH,
                bitmap: fakeBitmap(2000, 1000),
            };
            onSaved = jest.fn();
            jest.spyOn(client, "uploadContent").mockResolvedValue({ content_uri: "mxc://gua.global/new" });
            jest.spyOn(client, "setAccountData").mockResolvedValue({});
            HTMLElement.prototype.setPointerCapture = jest.fn();
            window.PointerEvent ??= FakePointerEvent as unknown as typeof PointerEvent;
        });

        const saved = (): Record<string, unknown> =>
            jest.mocked(client.setAccountData).mock.calls[0][1] as Record<string, unknown>;

        it("names its controls for screen readers", () => {
            render(<Editor />, withClientContextRenderOptions(client));
            expect(screen.getByRole("radiogroup", { name: "Preview appearance" })).toBeInTheDocument();
            expect(screen.getByRole("slider", { name: "Dim in dark mode" })).toHaveAttribute("aria-valuetext", "35%");
        });

        it("saves the nudged placement and the dim, previewing the dim in dark", async () => {
            render(<Editor />, withClientContextRenderOptions(client));
            fireEvent.click(screen.getByRole("button", { name: "Move the photo left" }));
            fireEvent.click(screen.getByRole("button", { name: "Move the photo up" }));
            fireEvent.change(screen.getByRole("slider", { name: "Dim in dark mode" }), { target: { value: "50" } });
            expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
            fireEvent.click(screen.getByRole("button", { name: "Set" }));
            await waitFor(() => expect(onSaved).toHaveBeenCalled());
            expect(saved()).toEqual(
                expect.objectContaining({
                    kind: "photo",
                    photo: expect.objectContaining({ url: "mxc://gua.global/new", dim: 50, align: { x: 600, y: 600 } }),
                }),
            );
        });

        it("moves the photo with a drag, against the overflow it has", async () => {
            jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
                width: 300,
                height: 300,
            } as DOMRect);
            const { container } = render(<Editor />, withClientContextRenderOptions(client));
            const frame = container.querySelector(".mx_GuaPhotoEditor_frame")!;
            fireEvent.pointerDown(frame, { clientX: 100, clientY: 100, pointerId: 1 });
            fireEvent.pointerMove(frame, { clientX: 130, clientY: 160, pointerId: 1 });
            fireEvent.pointerUp(frame, { pointerId: 1 });
            fireEvent.click(screen.getByRole("button", { name: "Set" }));
            await waitFor(() => expect(onSaved).toHaveBeenCalled());
            expect(saved()).toEqual(
                expect.objectContaining({ photo: expect.objectContaining({ align: { x: 400, y: 500 } }) }),
            );
        });

        it("closes the photo once it is gone", async () => {
            jest.useFakeTimers();
            try {
                const { unmount } = render(<Editor />, withClientContextRenderOptions(client));
                expect(prepared.bitmap.close).not.toHaveBeenCalled();
                unmount();
                act(() => jest.runOnlyPendingTimers());
                expect(prepared.bitmap.close).toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
