/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { PhotoTooLargeError, preparePhoto, uploadPhoto } from "../../../../src/gua/chatTheme/ui/photo/preparePhoto";
import { decodePhoto, fetchCapped } from "../../../../src/gua/chatTheme/render/PhotoLayer";
import { stubClient } from "../../../test-utils";

/** The JPEG sizes the canvas produces, in order. */
let encodedSizes: number[];
let toBlobCalls: { width: number; height: number; type?: string; quality?: unknown }[];

function fakeBitmap(width: number, height: number): ImageBitmap {
    return { width, height, close: jest.fn() } as unknown as ImageBitmap;
}

/** The size an image reports from its header, or null for a file that is not an image. */
let imageSize: { width: number; height: number } | null;
const RealImage = window.Image;

class FakeImage {
    public naturalWidth = 0;
    public naturalHeight = 0;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public set src(_url: string) {
        queueMicrotask(() => {
            if (imageSize) {
                this.naturalWidth = imageSize.width;
                this.naturalHeight = imageSize.height;
                this.onload?.();
            } else {
                this.onerror?.();
            }
        });
    }
}

describe("photo wallpapers", () => {
    let source: ImageBitmap;

    beforeAll(() => {
        window.Image = FakeImage as unknown as typeof Image;
        URL.createObjectURL = jest.fn(() => "blob:photo");
        URL.revokeObjectURL = jest.fn();
    });

    afterAll(() => {
        window.Image = RealImage;
    });

    beforeEach(() => {
        encodedSizes = [1_000_000];
        toBlobCalls = [];
        source = fakeBitmap(4000, 3000);
        imageSize = { width: 4000, height: 3000 };
        window.createImageBitmap = jest.fn(async (image: ImageBitmapSource) =>
            image instanceof Blob
                ? source
                : fakeBitmap((image as HTMLCanvasElement).width, (image as HTMLCanvasElement).height),
        ) as typeof window.createImageBitmap;
        jest.spyOn(CanvasRenderingContext2D.prototype, "drawImage").mockImplementation(() => {});
        jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
            this: HTMLCanvasElement,
            callback: BlobCallback,
            type?: string,
            quality?: unknown,
        ) {
            toBlobCalls.push({ width: this.width, height: this.height, type, quality });
            const size = encodedSizes.shift() ?? 1;
            callback(new Blob([new Uint8Array(size)], { type }));
        });
    });

    afterEach(() => jest.restoreAllMocks());

    it("encodes at most 2048 px as JPEG 0.8, oriented, with a 3 by 3 blurhash", async () => {
        const photo = await preparePhoto(new Blob(["x"]), 50_000_000);
        expect(window.createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
            imageOrientation: "from-image",
            resizeQuality: "high",
            resizeWidth: 2048,
        });
        expect(toBlobCalls).toEqual([{ width: 2048, height: 1536, type: "image/jpeg", quality: 0.8 }]);
        expect([photo.width, photo.height, photo.blob.size]).toEqual([2048, 1536, 1_000_000]);
        expect(photo.blurhash).toHaveLength(22);
        expect(source.close).toHaveBeenCalled();
    });

    it("encodes again at 1600 px and 0.75 when the first pass is over 1.5 MB", async () => {
        encodedSizes = [1_500_001, 900_000];
        const photo = await preparePhoto(new Blob(["x"]), undefined);
        expect(toBlobCalls.map(({ width, quality }) => [width, quality])).toEqual([
            [2048, 0.8],
            [1600, 0.75],
        ]);
        expect(photo.blob.size).toBe(900_000);
    });

    it("never scales a small photo up", async () => {
        source = fakeBitmap(800, 600);
        imageSize = { width: 800, height: 600 };
        const photo = await preparePhoto(new Blob(["x"]), undefined);
        expect(window.createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: "from-image" });
        expect([photo.width, photo.height]).toEqual([800, 600]);
    });

    it("decodes a tall camera photo at 2048 px on its long edge", async () => {
        source = fakeBitmap(3000, 4000);
        imageSize = { width: 3000, height: 4000 };
        await preparePhoto(new Blob(["x"]), undefined);
        expect(window.createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
            imageOrientation: "from-image",
            resizeQuality: "high",
            resizeHeight: 2048,
        });
    });

    it("refuses a photo over the server's upload limit", async () => {
        await expect(preparePhoto(new Blob(["x"]), 999_999)).rejects.toBeInstanceOf(PhotoTooLargeError);
    });

    it("uploads unencrypted without a file name and keeps the placement", async () => {
        const client: MatrixClient = stubClient();
        jest.spyOn(client, "uploadContent").mockResolvedValue({ content_uri: "mxc://gua.global/new" });
        const photo = await preparePhoto(new Blob(["x"]), undefined);
        expect(await uploadPhoto(client, photo, { dim: 50, alignX: 250, alignY: 1000 })).toEqual({
            url: "mxc://gua.global/new",
            mimetype: "image/jpeg",
            w: 2048,
            h: 1536,
            size: 1_000_000,
            blurhash: photo.blurhash,
            dim: 50,
            alignX: 250,
            alignY: 1000,
        });
        expect(client.uploadContent).toHaveBeenCalledWith(photo.blob, { type: "image/jpeg", includeFilename: false });
    });

    it("decodes a large photo at 2048 px on its long edge", async () => {
        imageSize = { width: 3000, height: 6000 };
        await decodePhoto(new Blob(["x"]), 3000, 6000);
        expect(window.createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
            resizeWidth: 1024,
            resizeHeight: 2048,
            resizeQuality: "high",
        });
    });

    it("decodes by the image's own size, whatever the event declares", async () => {
        imageSize = { width: 6000, height: 6000 };
        await decodePhoto(new Blob(["x"]), 100, 100);
        expect(window.createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
            resizeWidth: 2048,
            resizeHeight: 2048,
            resizeQuality: "high",
        });
    });

    it("refuses an image larger than the apps accept, or of another shape than declared", async () => {
        imageSize = { width: 30000, height: 30000 };
        await expect(decodePhoto(new Blob(["x"]), 100, 100)).rejects.toThrow("30000 by 30000");
        imageSize = { width: 4000, height: 1000 };
        await expect(decodePhoto(new Blob(["x"]), 100, 100)).rejects.toThrow("not 100 by 100");
        imageSize = null;
        await expect(decodePhoto(new Blob(["x"]), 100, 100)).rejects.toThrow("Not an image");
        expect(window.createImageBitmap).not.toHaveBeenCalled();
    });

    describe("download", () => {
        function respond(chunks: number[], contentLength?: number): void {
            const reader = {
                read: jest.fn(async () =>
                    chunks.length ? { done: false, value: new Uint8Array(chunks.shift()!) } : { done: true },
                ),
                cancel: jest.fn(),
            };
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: {
                    get: (name: string) => (name === "content-length" ? String(contentLength ?? "") : "image/jpeg"),
                },
                body: { getReader: () => reader },
            });
        }

        it("keeps a photo within the limit", async () => {
            respond([400, 600]);
            expect((await fetchCapped("https://example.org/a", 1000)).size).toBe(1000);
        });

        it("refuses a photo that declares more than the limit", async () => {
            respond([10], 1001);
            await expect(fetchCapped("https://example.org/a", 1000)).rejects.toThrow();
        });

        it("stops a photo that sends more than the limit", async () => {
            respond([600, 600]);
            await expect(fetchCapped("https://example.org/a", 1000)).rejects.toThrow();
        });
    });
});
