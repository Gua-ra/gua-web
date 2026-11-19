/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { act, renderHook } from "jest-matrix-react";
import { ClientEvent, type MatrixClient, MatrixEvent } from "matrix-js-sdk/src/matrix";
import React from "react";
import { mocked } from "jest-mock";

import MatrixClientContext from "../../../../src/contexts/MatrixClientContext";
import { AccountDataDocument, useAccountDataDocument } from "../../../../src/gua/expressions/accountDataDocument";
import { pushRecent, pushRecentSticker, useRecentStickers } from "../../../../src/gua/expressions/recents";
import { getMockClientWithEventEmitter, mockClientMethodsUser } from "../../../test-utils";

const TYPE = "global.gua.stickers";

function clientWithAccountData(initial?: Record<string, unknown>): MatrixClient {
    let stored = initial && new MatrixEvent({ type: TYPE, content: initial });
    const client = getMockClientWithEventEmitter({
        ...mockClientMethodsUser("@me:gua.global"),
        getAccountData: jest.fn(() => stored),
        setAccountData: jest.fn(async (type: string, content: Record<string, unknown>) => {
            stored = new MatrixEvent({ type, content });
            client.emit(ClientEvent.AccountData, stored);
            return {};
        }),
    });
    return client;
}

function wrapper(client: MatrixClient): React.FC<{ children: React.ReactNode }> {
    return ({ children }) => <MatrixClientContext.Provider value={client}>{children}</MatrixClientContext.Provider>;
}

describe("AccountDataDocument", () => {
    it("shows an edit at once and keeps it after the echo", async () => {
        const client = clientWithAccountData({ v: 1, other: true });
        const document = AccountDataDocument.for(client, TYPE);
        const update = document.update((content) => ({ ...content, favourites: [] }));
        expect(document.content).toEqual({ v: 1, other: true, favourites: [] });
        await update;
        expect(client.setAccountData).toHaveBeenCalledWith(TYPE, { v: 1, other: true, favourites: [] });
        expect(document.content).toEqual({ v: 1, other: true, favourites: [] });
    });

    it("rolls back an edit the server refuses", async () => {
        const client = clientWithAccountData({ v: 1 });
        mocked(client.setAccountData).mockRejectedValueOnce(new Error("M_LIMIT_EXCEEDED"));
        const document = AccountDataDocument.for(client, TYPE);
        await expect(document.update(() => ({ v: 2 }))).rejects.toThrow("M_LIMIT_EXCEEDED");
        expect(document.content).toEqual({ v: 1 });
    });

    it("builds a second edit on the pending first", async () => {
        const client = clientWithAccountData({});
        const document = AccountDataDocument.for(client, TYPE);
        const first = document.update((content) => ({ ...content, a: 1 }));
        const second = document.update((content) => ({ ...content, b: 2 }));
        await Promise.all([first, second]);
        expect(client.setAccountData).toHaveBeenLastCalledWith(TYPE, { a: 1, b: 2 });
    });

    it("re-renders on changes from other devices", () => {
        const client = clientWithAccountData({ v: 1 });
        const { result } = renderHook(() => useAccountDataDocument(TYPE), { wrapper: wrapper(client) });
        expect(result.current[0]).toEqual({ v: 1 });
        act(() => {
            mocked(client.getAccountData).mockReturnValue(new MatrixEvent({ type: TYPE, content: { v: 1, x: 1 } }));
            client.emit(ClientEvent.AccountData, new MatrixEvent({ type: TYPE, content: { v: 1, x: 1 } }));
        });
        expect(result.current[0]).toEqual({ v: 1, x: 1 });
    });
});

describe("recents", () => {
    beforeEach(() => localStorage.clear());

    it("moves an item to the front and keeps 30", () => {
        const items = Array.from({ length: 30 }, (_, i) => i);
        expect(pushRecent(items, 5, (a, b) => a === b).slice(0, 3)).toEqual([5, 0, 1]);
        expect(pushRecent(items, 99, (a, b) => a === b)).toHaveLength(30);
    });

    it("keeps stickers per account and updates subscribers", () => {
        const client = clientWithAccountData();
        const { result } = renderHook(() => useRecentStickers("@me:gua.global"), { wrapper: wrapper(client) });
        act(() => result.current.push({ url: "mxc://gua.global/cat", body: "Cat" }));
        act(() => pushRecentSticker("@me:gua.global", { url: "mxc://gua.global/dog" }));
        expect(result.current.items.map((image) => image.url)).toEqual([
            "mxc://gua.global/dog",
            "mxc://gua.global/cat",
        ]);
        act(() => result.current.remove({ url: "mxc://gua.global/cat" }));
        expect(result.current.items).toEqual([{ url: "mxc://gua.global/dog" }]);
        expect(localStorage.getItem("mx_gua_recent_stickers_@other:gua.global")).toBeNull();
    });
});
