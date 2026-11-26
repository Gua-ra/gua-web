/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    GifsUnavailableError,
    KlipyGifProvider,
    klipyLocale,
    parseKlipyPage,
} from "../../../../src/gua/expressions/klipy";

function gif(slug: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 1,
        slug,
        title: `Title ${slug}`,
        type: "gif",
        file: {
            sm: {
                webp: { url: `https://static.klipy.com/${slug}.webp`, width: 200, height: 100, size: 5000 },
                jpg: { url: `https://static.klipy.com/${slug}.jpg`, width: 200, height: 100, size: 900 },
            },
        },
        ...extra,
    };
}

function page(items: unknown[], extra: Record<string, unknown> = {}): unknown {
    return { result: true, data: { data: items, current_page: 1, has_next: false, ...extra } };
}

function respond(body: unknown, status = 200): jest.Mock {
    return jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

describe("KLIPY", () => {
    it("skips items that are not GIFs or have no slug", () => {
        const result = parseKlipyPage(page([gif("a"), gif("ad", { type: "ad" }), gif(" ")]), 1);
        expect(result.items.map((item) => item.id)).toEqual(["a"]);
    });

    it("reads paging from the response", () => {
        expect(parseKlipyPage(page([], { current_page: 3, has_next: true }), 1)).toEqual({
            items: [],
            page: 3,
            hasNext: true,
        });
        expect(parseKlipyPage({}, 2)).toEqual({ items: [], page: 2, hasNext: false });
    });

    it("searches with the documented parameters and no user identifiers", async () => {
        const fetchFn = respond(page([gif("a")]));
        const provider = new KlipyGifProvider("key/1", fetchFn, () => "br");
        const result = await provider.search("olá", 2);

        const url = new URL(fetchFn.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe("https://api.klipy.com/api/v1/key%2F1/gifs/search");
        expect(Object.fromEntries(url.searchParams)).toEqual({
            q: "olá",
            page: "2",
            per_page: "30",
            locale: "br",
            content_filter: "medium",
            format_filter: "webp,jpg",
        });
        expect(result.items).toHaveLength(1);
    });

    it("looks favourites up by slug and keeps the requested order", async () => {
        const fetchFn = respond(page([gif("b"), gif("a")]));
        const provider = new KlipyGifProvider("key", fetchFn, () => "ca");
        const items = await provider.items(["a", "missing", "b"]);

        const url = new URL(fetchFn.mock.calls[0][0]);
        expect(url.pathname).toBe("/api/v1/key/gifs/items");
        expect(url.searchParams.get("slugs")).toBe("a,missing,b");
        expect(items.map((item) => item.id)).toEqual(["a", "b"]);
    });

    it("does not call KLIPY for an empty list", async () => {
        const fetchFn = respond(page([]));
        await expect(new KlipyGifProvider("key", fetchFn).items([])).resolves.toEqual([]);
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("is unavailable without a key", async () => {
        const fetchFn = respond(page([]));
        const provider = new KlipyGifProvider("", fetchFn);
        expect(provider.isAvailable).toBe(false);
        await expect(provider.trending(1)).rejects.toThrow(GifsUnavailableError);
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("fails on an error status", async () => {
        const provider = new KlipyGifProvider("key", respond({}, 429), () => "us");
        await expect(provider.trending(1)).rejects.toThrow("KLIPY answered 429");
    });

    it("passes the abort signal through", async () => {
        const fetchFn = respond(page([]));
        const controller = new AbortController();
        await new KlipyGifProvider("key", fetchFn, () => "us").trending(1, controller.signal);
        expect(fetchFn.mock.calls[0][1]).toEqual({ signal: controller.signal });
    });

    it("sends the region, else the language", () => {
        expect(klipyLocale(["pt-BR"])).toBe("br");
        expect(klipyLocale(["fr-CA", "en"])).toBe("ca");
        expect(klipyLocale(["en"])).toBe("us");
        expect(klipyLocale(["zz"])).toBe("zz");
        expect(klipyLocale([])).toBe("en");
    });
});
