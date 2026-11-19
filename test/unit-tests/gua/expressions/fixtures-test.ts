/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type IEventRelation, type MatrixClient, MatrixEvent } from "matrix-js-sdk/src/matrix";

import fixtures from "./stickers-fixtures.json";
import { type JsonObject } from "../../../../src/gua/expressions/StickerImage";
import { stickerImageForFile } from "../../../../src/gua/expressions/stickerContent";
import {
    addSticker,
    decodeStickerLibrary,
    deleteSticker,
    favouriteSticker,
    stickerShortcode,
    StickerLimitReachedError,
    unfavouriteSticker,
} from "../../../../src/gua/expressions/stickerLibrary";
import { decodeStickerPack } from "../../../../src/gua/expressions/stickerPacks";
import { favouriteGif, unfavouriteGif } from "../../../../src/gua/expressions/gifLibrary";
import { gifForSending, parseKlipyItem } from "../../../../src/gua/expressions/klipy";
import { sendSticker } from "../../../../src/gua/expressions/senders";

const SHARED_INFO = { h: 256, mimetype: "image/png", size: 120034, w: 256 };
const BASE_TIME = 1762905600000;

/** Expands the fixtures' `generate` shorthand, as the notes describe. */
function start(value: JsonObject): JsonObject {
    const generate = value.generate as { images: number; favourites: number } | undefined;
    if (!generate) return value;
    const images: JsonObject = {};
    for (let i = 0; i < generate.images; i++) {
        images[`s${(BASE_TIME + i).toString(36)}`] = {
            "body": `S${i}`,
            "global.gua.added": BASE_TIME + i,
            "info": SHARED_INFO,
            "url": `mxc://gua.global/s${i}`,
        };
    }
    const favourites = Array.from({ length: generate.favourites }, (_, i) => ({
        body: `F${i}`,
        info: SHARED_INFO,
        url: `mxc://gua.global/f${i}`,
    }));
    return { favourites, images, v: 1 };
}

/** The decoder's output in the fixtures' shape, where absent fields are null. */
function decoded(content: JsonObject): unknown {
    const library = decodeStickerLibrary(content);
    return {
        favourites: library.favourites,
        images: library.stickers.map(({ shortcode, image, addedAt }) => ({
            added: addedAt ?? null,
            body: image.body ?? null,
            info: image.info ?? null,
            shortcode,
            url: image.url,
        })),
    };
}

function sortedKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortedKeys);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, sortedKeys((value as JsonObject)[key])]),
        );
    }
    return value;
}

describe("shared sticker fixtures", () => {
    it("is fixture version 1", () => {
        expect(fixtures.version).toBe(1);
    });

    describe("sticker content", () => {
        it.each(fixtures.stickerContent.map((testCase) => [testCase.name, testCase] as const))(
            "%s",
            async (_name, { input, expected }) => {
                const sendEvent = jest.fn().mockResolvedValue({ event_id: "$sent" });
                const client = { sendEvent } as unknown as MatrixClient;
                const image = stickerImageForFile({
                    url: input.url,
                    body: input.body,
                    width: input.width,
                    height: input.height,
                    mimetype: input.mimetype,
                    size: input.size,
                    isAnimated: "isAnimated" in input ? input.isAnimated : undefined,
                });
                const threadRoot = "threadRoot" in input ? input.threadRoot : undefined;
                const replyTo = "replyTo" in input ? input.replyTo : undefined;
                // In a thread the composer's relation already replies to the latest event, as a fallback.
                const relation: IEventRelation | undefined = threadRoot
                    ? {
                          "rel_type": "m.thread",
                          "event_id": threadRoot,
                          "is_falling_back": true,
                          "m.in_reply_to": { event_id: replyTo! },
                      }
                    : undefined;
                const replyToEvent =
                    replyTo && !threadRoot
                        ? new MatrixEvent({ type: "m.room.message", event_id: replyTo, room_id: "!room" })
                        : undefined;

                await sendSticker(client, { roomId: "!room", relation, replyToEvent }, image);

                const [, threadId, type, content] = sendEvent.mock.calls[0];
                expect(type).toBe("m.sticker");
                expect(threadId).toBe(threadRoot ?? null);
                expect(JSON.stringify(sortedKeys(content))).toBe(JSON.stringify(sortedKeys(expected)));
            },
        );
    });

    describe("library decoding", () => {
        it.each(fixtures.library.decode.map((testCase) => [testCase.name, testCase] as const))(
            "%s",
            (_name, { input, expected }) => {
                expect(decoded(input as JsonObject)).toEqual(expected);
            },
        );
    });

    describe("library operations", () => {
        type Operation = (typeof fixtures.library.operations)[number];
        const run = (testCase: Operation): JsonObject => {
            const content = start(testCase.start as JsonObject);
            const op = testCase.op as JsonObject;
            switch (op.type) {
                case "add":
                    return addSticker(
                        content,
                        { url: op.url as string, body: op.body as string, info: op.info as JsonObject },
                        op.now as number,
                    );
                case "favourite":
                    return favouriteSticker(content, op.image as { url: string });
                case "unfavourite":
                    return unfavouriteSticker(content, op.url as string);
                case "delete":
                    return deleteSticker(content, op.shortcode as string);
                default:
                    throw new Error(`Unknown operation ${op.type}`);
            }
        };
        const cases = (filter: (testCase: Operation) => boolean): [string, Operation][] =>
            fixtures.library.operations.filter(filter).map((testCase) => [testCase.name, testCase]);

        it.each(cases((testCase) => "expected" in testCase))("%s", (_name, testCase) => {
            expect(run(testCase)).toEqual((testCase as { expected: unknown }).expected);
        });

        it.each(cases((testCase) => "expectedError" in testCase))("%s", (_name, testCase) => {
            expect(() => run(testCase)).toThrow(StickerLimitReachedError);
        });

        it.each(cases((testCase) => "expectedFavouritesCount" in testCase))("%s", (_name, testCase) => {
            const expected = testCase as {
                expectedFavouritesCount: number;
                expectedFirstFavourite: unknown;
                expectedLastFavourite: unknown;
            };
            const favourites = run(testCase).favourites as unknown[];
            expect(favourites).toHaveLength(expected.expectedFavouritesCount);
            expect(favourites[0]).toEqual(expected.expectedFirstFavourite);
            expect(favourites[favourites.length - 1]).toEqual(expected.expectedLastFavourite);
        });
    });

    describe("packs", () => {
        it.each(fixtures.packs.map((testCase) => [testCase.name, testCase] as const))(
            "%s",
            (_name, { eventType, stateKey, content, roomName, expected }) => {
                const pack = decodeStickerPack(eventType, stateKey, content as JsonObject, roomName);
                expect({
                    avatarUrl: pack.avatarUrl ?? null,
                    displayName: pack.displayName,
                    stickers: pack.stickers.map(({ shortcode, image }) => ({
                        body: image.body ?? null,
                        info: image.info ?? null,
                        shortcode,
                        url: image.url,
                    })),
                }).toEqual(expected);
            },
        );
    });

    describe("shortcodes", () => {
        it.each(fixtures.shortcodes.map((testCase) => [testCase.expected, testCase] as const))(
            "%s",
            (_name, { existing, now, expected }) => {
                expect(stickerShortcode(now, new Set(existing))).toBe(expected);
            },
        );
    });

    describe("GIF rendition", () => {
        it.each(fixtures.gifRendition.map((testCase) => [testCase.name, testCase] as const))(
            "%s",
            (_name, { item, expected }) => {
                const parsed = parseKlipyItem(item);
                const selection = parsed && gifForSending(parsed);
                expect(
                    selection
                        ? {
                              body: selection.body,
                              height: selection.file.height,
                              rendition: selection.size,
                              size: selection.file.size,
                              thumbnailUrl: selection.still?.url ?? null,
                              url: selection.file.url,
                              width: selection.file.width,
                          }
                        : null,
                ).toEqual(expected);
            },
        );
    });

    describe("GIF library", () => {
        it.each(fixtures.gifLibrary.map((testCase) => [testCase.name, testCase] as const))("%s", (_name, testCase) => {
            const content = testCase.start as JsonObject;
            const limit = "limit" in testCase ? (testCase.limit as number) : undefined;
            const result =
                testCase.op.type === "favourite"
                    ? favouriteGif(content, testCase.op.id, "klipy", limit)
                    : unfavouriteGif(content, testCase.op.id, "klipy");
            expect(result).toEqual(testCase.expected);
        });
    });
});
