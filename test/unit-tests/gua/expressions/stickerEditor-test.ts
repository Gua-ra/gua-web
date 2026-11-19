/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { fittedContentSize, imageRect, opaqueBounds, shrunk } from "../../../../src/gua/expressions/stickerEditor";
import { stickerMaxHeight } from "../../../../src/components/views/messages/MStickerBody";

describe("sticker editor geometry", () => {
    it("aspect-fits the photo, then scales about the centre and moves it", () => {
        expect(imageRect({ width: 1024, height: 512 }, { scale: 1, offsetX: 0, offsetY: 0 })).toEqual({
            x: 0,
            y: 128,
            width: 512,
            height: 256,
        });
        expect(imageRect({ width: 512, height: 512 }, { scale: 2, offsetX: 10, offsetY: -20 })).toEqual({
            x: -246,
            y: -276,
            width: 1024,
            height: 1024,
        });
    });

    it("finds the opaque bounds, or none", () => {
        const rgba = new Uint8ClampedArray(4 * 4 * 4);
        expect(opaqueBounds(4, 4, rgba)).toBeUndefined();
        rgba[(1 * 4 + 2) * 4 + 3] = 255;
        rgba[(2 * 4 + 1) * 4 + 3] = 10;
        expect(opaqueBounds(4, 4, rgba)).toEqual({ left: 1, top: 1, right: 3, bottom: 3 });
    });

    it("fits the content in 480 so the padded sticker is at most 512", () => {
        expect(fittedContentSize(1000, 500)).toEqual({ width: 480, height: 240 });
        expect(fittedContentSize(10, 20)).toEqual({ width: 240, height: 480 });
    });

    it("shrinks by a fifth until 96", () => {
        expect(shrunk({ width: 480, height: 240 })).toEqual({ width: 384, height: 192 });
        expect(shrunk({ width: 96, height: 50 })).toBeUndefined();
    });
});

describe("timeline sticker size", () => {
    it("fits within 160 by 160", () => {
        expect(stickerMaxHeight({ w: 256, h: 256 })).toBe(160);
        expect(stickerMaxHeight({ w: 256, h: 128 })).toBe(80);
        expect(stickerMaxHeight({ w: 100, h: 200 })).toBe(160);
        expect(stickerMaxHeight(undefined)).toBe(160);
        expect(stickerMaxHeight({ w: 256, h: 256 }, 100)).toBe(100);
    });
});
