/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "jest-matrix-react";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { mocked } from "jest-mock";

import MatrixClientContext from "../../../../src/contexts/MatrixClientContext";
import { ExpressionPanel } from "../../../../src/gua/expressions/ExpressionPanel";
import { type GifItem, type GifProvider } from "../../../../src/gua/expressions/klipy";
import { sendGif } from "../../../../src/gua/expressions/senders";
import { stubClient } from "../../../test-utils";

jest.mock("../../../../src/gua/expressions/senders", () => ({
    ...jest.requireActual("../../../../src/gua/expressions/senders"),
    sendGif: jest.fn(),
}));

const ME = "@userId:matrix.org";

function gif(id: string): GifItem {
    return {
        id,
        title: `GIF ${id}`,
        renditions: {
            sm: { animated: { url: `https://static.klipy.com/${id}.webp`, width: 200, height: 100, size: 1 } },
        },
    };
}

function provider(overrides: Partial<GifProvider> = {}): GifProvider {
    return {
        isAvailable: true,
        search: jest.fn(async (query: string) => ({ items: [gif(`search-${query}`)], page: 1, hasNext: false })),
        trending: jest.fn(async () => ({ items: [gif("trending")], page: 1, hasNext: false })),
        items: jest.fn(async (ids: string[]) => ids.map(gif)),
        ...overrides,
    };
}

describe("ExpressionPanel", () => {
    let client: MatrixClient;
    let room: Room;
    let onFinished: jest.Mock;
    let onCreateSticker: jest.Mock;

    beforeEach(() => {
        localStorage.clear();
        client = stubClient();
        mocked(client.getAccountData).mockReturnValue(undefined);
        room = new Room("!room:gua.global", client, ME);
        onFinished = jest.fn();
        onCreateSticker = jest.fn();
    });

    function renderPanel(gifProvider: GifProvider = provider()): ReturnType<typeof render> {
        return render(
            <MatrixClientContext.Provider value={client}>
                <ExpressionPanel
                    room={room}
                    target={{ roomId: room.roomId }}
                    addEmoji={jest.fn()}
                    onFinished={onFinished}
                    onCreateSticker={onCreateSticker}
                    gifProvider={gifProvider}
                />
            </MatrixClientContext.Provider>,
        );
    }

    it("opens on Stickers first, then on the last tab used", async () => {
        const { unmount } = renderPanel();
        expect(screen.getByRole("tab", { name: "Stickers" })).toHaveAttribute("aria-selected", "true");
        fireEvent.click(screen.getByRole("tab", { name: "GIF" }));
        await screen.findByRole("button", { name: "GIF, GIF trending" });
        unmount();
        renderPanel();
        expect(screen.getByRole("tab", { name: "GIF" })).toHaveAttribute("aria-selected", "true");
        await screen.findByRole("button", { name: "GIF, GIF trending" });
    });

    it("has no word chips", () => {
        renderPanel();
        for (const word of ["Hi", "Haha", "Love", "Sad", "Wow"]) {
            expect(screen.queryByRole("button", { name: word })).toBeNull();
        }
    });

    it("shows Create sticker in Recent even when empty", () => {
        renderPanel();
        fireEvent.click(screen.getByRole("button", { name: "Create sticker" }));
        expect(onCreateSticker).toHaveBeenCalled();
    });

    it("sends a recent sticker on click and closes", async () => {
        localStorage.setItem(
            `mx_gua_recent_stickers_${ME}`,
            JSON.stringify([
                { body: "Cat", info: { h: 128, w: 128, mimetype: "image/png", size: 1 }, url: "mxc://gua.global/cat" },
            ]),
        );
        renderPanel();
        fireEvent.click(screen.getByRole("button", { name: "Sticker, Cat" }));
        expect(onFinished).toHaveBeenCalled();
        await waitFor(() =>
            expect(client.sendEvent).toHaveBeenCalledWith("!room:gua.global", null, "m.sticker", {
                body: "Cat",
                info: { h: 128, w: 128, mimetype: "image/png", size: 1 },
                url: "mxc://gua.global/cat",
            }),
        );
    });

    it("shows My stickers and chat packs as sections", () => {
        mocked(client.getAccountData).mockImplementation((type) =>
            type === "global.gua.stickers"
                ? new MatrixEvent({
                      type,
                      content: { images: { s1: { body: "Mine", url: "mxc://gua.global/mine" } }, v: 1 },
                  })
                : undefined,
        );
        room.currentState.setStateEvents([
            new MatrixEvent({
                type: "m.room.image_pack",
                state_key: "pets",
                room_id: room.roomId,
                sender: ME,
                event_id: "$pack",
                content: { pack: { display_name: "Pets" }, images: { wave: { url: "mxc://gua.global/wave" } } },
            }),
        ]);
        renderPanel();
        expect(screen.getByRole("region", { name: "My stickers" })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Pets" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sticker, wave" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Favourites" })).toBeNull();
    });

    describe("GIF tab", () => {
        beforeEach(() => localStorage.setItem("mx_gua_expressions_last_tab", "gif"));

        it("says GIFs are unavailable without a key, and nothing else", () => {
            renderPanel(provider({ isAvailable: false }));
            expect(screen.getByText("GIFs aren't available in this version")).toBeInTheDocument();
            expect(screen.queryByPlaceholderText("Search KLIPY")).toBeNull();
        });

        it("starts on Trending", async () => {
            renderPanel();
            expect(await screen.findByRole("button", { name: "GIF, GIF trending" })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Trending" })).toHaveAttribute("aria-pressed", "true");
        });

        it("searches 300 ms after typing stops, once", async () => {
            jest.useFakeTimers();
            try {
                const gifs = provider();
                renderPanel(gifs);
                const search = screen.getByPlaceholderText("Search KLIPY");
                fireEvent.change(search, { target: { value: "ca" } });
                act(() => jest.advanceTimersByTime(200));
                fireEvent.change(search, { target: { value: "cat" } });
                act(() => jest.advanceTimersByTime(300));
                await act(async () => {});
                expect(gifs.search).toHaveBeenCalledTimes(1);
                expect(gifs.search).toHaveBeenCalledWith("cat", 1, expect.any(AbortSignal));
            } finally {
                jest.useRealTimers();
            }
        });

        it("offers Try again after an error", async () => {
            const gifs = provider({ trending: jest.fn().mockRejectedValueOnce(new Error("offline")) });
            mocked(gifs.trending).mockResolvedValue({ items: [gif("again")], page: 1, hasNext: false });
            renderPanel(gifs);
            fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
            expect(await screen.findByRole("button", { name: "GIF, GIF again" })).toBeInTheDocument();
        });

        it("previews a GIF and sends it with its caption", async () => {
            mocked(sendGif).mockResolvedValue();
            renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: "GIF, GIF trending" }));
            fireEvent.change(screen.getByPlaceholderText("Add a caption"), { target: { value: "oi" } });
            fireEvent.click(screen.getByRole("button", { name: "Send" }));
            await waitFor(() => expect(onFinished).toHaveBeenCalled());
            expect(sendGif).toHaveBeenCalledWith(client, { roomId: room.roomId }, gif("trending"), "oi");
            expect(JSON.parse(localStorage.getItem(`mx_gua_recent_gifs_${ME}`)!)).toEqual(["trending"]);
        });

        it("toggles a favourite on right-click", async () => {
            renderPanel();
            fireEvent.contextMenu(await screen.findByRole("button", { name: "GIF, GIF trending" }));
            await waitFor(() =>
                expect(client.setAccountData).toHaveBeenCalledWith("global.gua.gifs", {
                    favourites: [{ id: "trending", p: "klipy" }],
                    v: 1,
                }),
            );
        });
    });
});
