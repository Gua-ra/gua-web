/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { fireEvent, render, screen, waitFor } from "jest-matrix-react";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { mocked } from "jest-mock";

import StickerDetailsDialog from "../../../../src/gua/expressions/StickerDetailsDialog";
import { stubClient } from "../../../test-utils";

const ME = "@userId:matrix.org";
const image = { body: "Wave", info: { h: 128, w: 128, mimetype: "image/png", size: 1 }, url: "mxc://gua.global/wave" };

describe("StickerDetailsDialog", () => {
    let client: MatrixClient;
    let room: Room;

    beforeEach(() => {
        client = stubClient();
        mocked(client.getAccountData).mockReturnValue(undefined);
        mocked(client.setAccountData).mockResolvedValue({});
        room = new Room("!room:gua.global", client, ME);
    });

    it("names the chat pack and saves the sticker to My stickers", async () => {
        room.currentState.setStateEvents([
            new MatrixEvent({
                type: "m.room.image_pack",
                state_key: "pets",
                room_id: room.roomId,
                sender: ME,
                event_id: "$pack",
                content: { pack: { display_name: "Pets" }, images: { wave: { url: image.url } } },
            }),
        ]);
        render(<StickerDetailsDialog image={image} room={room} onFinished={jest.fn()} />);

        expect(screen.getByText("From Pets")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Save to my stickers" }));

        await screen.findByText("Saved to my stickers");
        const [type, content] = mocked(client.setAccountData).mock.calls[0] as unknown as [
            string,
            { images: Record<string, Record<string, unknown>>; v: number },
        ];
        expect(type).toBe("global.gua.stickers");
        expect(Object.values(content.images)).toEqual([{ ...image, "global.gua.added": expect.any(Number) }]);
    });

    it("offers only the favourite action for a sticker already saved", async () => {
        mocked(client.getAccountData).mockReturnValue(
            new MatrixEvent({ type: "global.gua.stickers", content: { images: { s1: image }, v: 1 } }),
        );
        render(<StickerDetailsDialog image={image} room={room} onFinished={jest.fn()} />);

        expect(screen.queryByRole("button", { name: "Save to my stickers" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Add to favourites" }));
        await waitFor(() =>
            expect(client.setAccountData).toHaveBeenCalledWith("global.gua.stickers", {
                favourites: [image],
                images: { s1: image },
                v: 1,
            }),
        );
    });
});
