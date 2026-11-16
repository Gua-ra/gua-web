/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { isJsonObject, type JsonObject, numberField, stringField } from "./StickerImage";

const BASE_URL = "https://api.klipy.com/api/v1/";
const PAGE_SIZE = 30;
const MAX_HD_SIZE = 1_500_000;
const DEFAULT_GIF_BODY = "GIF";

const SIZES = ["hd", "md", "sm", "xs"] as const;
type GifSize = (typeof SIZES)[number];

export interface GifFile {
    url: string;
    width: number;
    height: number;
    size: number;
}

interface GifRendition {
    animated: GifFile;
    still?: GifFile;
}

export interface GifItem {
    /** What favourites and recents store; KLIPY looks items up by it. */
    id: string;
    title: string;
    renditions: Partial<Record<GifSize, GifRendition>>;
}

export interface GifPage {
    items: GifItem[];
    page: number;
    hasNext: boolean;
}

export interface GifSelection {
    size: GifSize;
    file: GifFile;
    still?: GifFile;
    body: string;
}

export class GifsUnavailableError extends Error {
    public constructor() {
        super("This build has no GIF provider key");
    }
}

export interface GifProvider {
    readonly isAvailable: boolean;
    search(query: string, page: number, signal?: AbortSignal): Promise<GifPage>;
    trending(page: number, signal?: AbortSignal): Promise<GifPage>;
    items(ids: string[], signal?: AbortSignal): Promise<GifItem[]>;
}

export function gifPreview(item: GifItem): GifFile | undefined {
    return (["sm", "xs", "md", "hd"] as const).map((size) => item.renditions[size]?.animated).find(Boolean);
}

/** `hd` when it is at most 1.5 MB, otherwise the next size down. */
export function gifForSending(item: GifItem): GifSelection | undefined {
    for (const size of SIZES) {
        const rendition = item.renditions[size];
        if (!rendition || (size === "hd" && rendition.animated.size > MAX_HD_SIZE)) continue;
        return { size, file: rendition.animated, still: rendition.still, body: item.title.trim() || DEFAULT_GIF_BODY };
    }
    return undefined;
}

/** Items that are not GIFs are skipped: KLIPY mixes other types, ads included, into some results. */
export function parseKlipyItem(json: unknown): GifItem | undefined {
    if (!isJsonObject(json) || json.type !== "gif") return undefined;
    // KLIPY looks items up by slug, not by numeric id.
    const slug = stringField(json, "slug");
    if (!slug?.trim()) return undefined;
    const files = isJsonObject(json.file) ? json.file : undefined;
    const renditions: GifItem["renditions"] = {};
    for (const size of SIZES) {
        const formats = isJsonObject(files?.[size]) ? (files[size] as JsonObject) : undefined;
        const animated = parseFile(formats?.webp);
        if (animated) renditions[size] = { animated, still: parseFile(formats?.jpg) };
    }
    return { id: slug, title: stringField(json, "title") ?? "", renditions };
}

export function parseKlipyPage(root: unknown, requestedPage: number): GifPage {
    const data = isJsonObject(root) && isJsonObject(root.data) ? root.data : undefined;
    const items = Array.isArray(data?.data) ? data.data : [];
    return {
        items: items.map(parseKlipyItem).filter((item): item is GifItem => !!item),
        page: numberField(data, "current_page") ?? requestedPage,
        hasNext: data?.has_next === true,
    };
}

function parseFile(json: unknown): GifFile | undefined {
    if (!isJsonObject(json)) return undefined;
    const url = stringField(json, "url");
    const width = numberField(json, "width");
    const height = numberField(json, "height");
    const size = numberField(json, "size");
    if (url === undefined || width === undefined || height === undefined || size === undefined) return undefined;
    return { url, width, height, size };
}

/** The device region as a lowercase ISO 3166 code, else the app language. */
export function klipyLocale(languages: readonly string[] = navigator.languages): string {
    for (const language of languages) {
        try {
            const region = new Intl.Locale(language).maximize().region;
            if (region && /^[A-Za-z]{2}$/.test(region)) return region.toLowerCase();
        } catch {
            // An unparseable tag; try the next one.
        }
    }
    return (languages[0] ?? "en").split("-")[0].toLowerCase();
}

export class KlipyGifProvider implements GifProvider {
    public constructor(
        private readonly apiKey: string,
        private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
        private readonly locale: () => string = () => klipyLocale(),
    ) {}

    public get isAvailable(): boolean {
        return this.apiKey.length > 0;
    }

    public search(query: string, page: number, signal?: AbortSignal): Promise<GifPage> {
        return this.fetchPage("search", page, signal, { q: query });
    }

    public trending(page: number, signal?: AbortSignal): Promise<GifPage> {
        return this.fetchPage("trending", page, signal);
    }

    public async items(ids: string[], signal?: AbortSignal): Promise<GifItem[]> {
        if (ids.length === 0) return [];
        const url = new URL(this.endpoint("items"));
        url.searchParams.set("slugs", ids.join(","));
        const page = await this.fetch(url, 1, signal);
        const byId = new Map(page.items.map((item) => [item.id, item]));
        return ids.map((id) => byId.get(id)).filter((item): item is GifItem => !!item);
    }

    private fetchPage(
        path: string,
        page: number,
        signal?: AbortSignal,
        query: Record<string, string> = {},
    ): Promise<GifPage> {
        const url = new URL(this.endpoint(path));
        for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
        url.searchParams.set("page", String(page));
        url.searchParams.set("per_page", String(PAGE_SIZE));
        url.searchParams.set("locale", this.locale());
        url.searchParams.set("content_filter", "medium");
        url.searchParams.set("format_filter", "webp,jpg");
        return this.fetch(url, page, signal);
    }

    private async fetch(url: URL, requestedPage: number, signal?: AbortSignal): Promise<GifPage> {
        if (!this.isAvailable) throw new GifsUnavailableError();
        const response = await this.fetchFn(url.toString(), { signal });
        if (!response.ok) throw new Error(`KLIPY answered ${response.status}`);
        return parseKlipyPage(await response.json(), requestedPage);
    }

    private endpoint(path: string): string {
        return `${BASE_URL}${encodeURIComponent(this.apiKey)}/gifs/${path}`;
    }
}

let provider: GifProvider | undefined;

/** The key is baked in at build time from the `KLIPY_API_KEY` secret; without it GIFs are unavailable. */
export function gifProvider(): GifProvider {
    provider ??= new KlipyGifProvider(process.env.KLIPY_API_KEY ?? "");
    return provider;
}
