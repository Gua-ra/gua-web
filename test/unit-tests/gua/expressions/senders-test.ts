/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { mocked } from "jest-mock";

import { uploadFile } from "../../../../src/ContentMessages";
import { GifSendError, sendGif } from "../../../../src/gua/expressions/senders";
import { type GifItem } from "../../../../src/gua/expressions/klipy";

jest.mock("../../../../src/ContentMessages", () => ({
    ...jest.requireActual("../../../../src/ContentMessages"),
    uploadFile: jest.fn(),
}));

const item: GifItem = {
    id: "hello-42",
    title: "Hello",
    renditions: {
        hd: {
            animated: { url: "https://static.klipy.com/hd.webp", width: 498, height: 280, size: 2_000_000 },
            still: { url: "https://static.klipy.com/hd.jpg", width: 498, height: 280, size: 16_000 },
        },
        md: {
            animated: { url: "https://static.klipy.com/md.webp", width: 320, height: 180, size: 300_000 },
            still: { url: "https://static.klipy.com/md.jpg", width: 320, height: 180, size: 9_000 },
        },
    },
};

function fetchFn(failing?: string): jest.Mock {
    return jest.fn(async (url: string) =>
        url === failing
            ? { ok: false, status: 404 }
            : { ok: true, status: 200, blob: async () => new Blob([url], { type: "application/octet-stream" }) },
    );
}

describe("sendGif", () => {
    let client: MatrixClient;

    beforeEach(() => {
        client = { sendEvent: jest.fn().mockResolvedValue({ event_id: "$sent" }) } as unknown as MatrixClient;
        mocked(uploadFile).mockImplementation(async (_client, _roomId, file) => ({
            url: file instanceof File ? "mxc://gua.global/gif" : "mxc://gua.global/still",
        }));
    });

    it("sends the md rendition when hd is over 1.5 MB, with the still as thumbnail", async () => {
        const fetch = fetchFn();
        await sendGif(client, { roomId: "!room" }, item, "", fetch);

        expect(fetch.mock.calls.map(([url]) => url)).toEqual([
            "https://static.klipy.com/md.webp",
            "https://static.klipy.com/md.jpg",
        ]);
        const [roomId, threadId, type, content] = mocked(client.sendEvent).mock.calls[0] as unknown as [
            string,
            string | null,
            string,
            Record<string, unknown>,
        ];
        expect([roomId, threadId, type]).toEqual(["!room", null, "m.room.message"]);
        expect(content).toEqual({
            msgtype: "m.image",
            body: "Hello",
            info: {
                "h": 180,
                "is_animated": true,
                "org.matrix.msc4230.is_animated": true,
                "mimetype": "image/webp",
                "size": "https://static.klipy.com/md.webp".length,
                "w": 320,
                "thumbnail_info": {
                    h: 180,
                    mimetype: "image/jpeg",
                    size: "https://static.klipy.com/md.jpg".length,
                    w: 320,
                },
                "thumbnail_url": "mxc://gua.global/still",
            },
            url: "mxc://gua.global/gif",
        });
        const uploaded = mocked(uploadFile).mock.calls[1][2] as File;
        expect([uploaded.name, uploaded.type]).toEqual(["Hello.webp", "image/webp"]);
    });

    it("uses the caption as the body and keeps the title as the file name", async () => {
        await sendGif(client, { roomId: "!room" }, item, " Bom dia ", fetchFn());
        const content = mocked(client.sendEvent).mock.calls[0][3] as unknown as Record<string, unknown>;
        expect(content.body).toBe("Bom dia");
        expect(content.filename).toBe("Hello.webp");
    });

    it("uses encrypted files in encrypted rooms", async () => {
        mocked(uploadFile).mockImplementation(async (_client, _roomId, file) => ({
            file: { url: file instanceof File ? "mxc://gua.global/gif" : "mxc://gua.global/still" } as never,
        }));
        await sendGif(client, { roomId: "!room" }, item, "", fetchFn());
        const content = mocked(client.sendEvent).mock.calls[0][3] as unknown as Record<string, any>;
        expect(content.file).toEqual({ url: "mxc://gua.global/gif" });
        expect(content.url).toBeUndefined();
        expect(content.info.thumbnail_file).toEqual({ url: "mxc://gua.global/still" });
    });

    it("sends without a thumbnail when the still fails, and in the thread", async () => {
        await sendGif(
            client,
            {
                roomId: "!room",
                relation: {
                    "rel_type": "m.thread",
                    "event_id": "$root",
                    "is_falling_back": true,
                    "m.in_reply_to": { event_id: "$latest" },
                },
            },
            item,
            "",
            fetchFn("https://static.klipy.com/md.jpg"),
        );
        const [, threadId, , content] = mocked(client.sendEvent).mock.calls[0] as unknown as [
            string,
            string,
            string,
            Record<string, any>,
        ];
        expect(threadId).toBe("$root");
        expect(content.info.thumbnail_url).toBeUndefined();
        expect(content["m.relates_to"]).toEqual({
            "rel_type": "m.thread",
            "event_id": "$root",
            "is_falling_back": true,
            "m.in_reply_to": { event_id: "$latest" },
        });
    });

    it("fails when the GIF cannot be downloaded", async () => {
        await expect(
            sendGif(client, { roomId: "!room" }, item, "", fetchFn("https://static.klipy.com/md.webp")),
        ).rejects.toThrow(GifSendError);
        expect(client.sendEvent).not.toHaveBeenCalled();
    });
});
