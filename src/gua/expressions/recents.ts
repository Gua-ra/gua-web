/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useMemo, useSyncExternalStore } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import { type StickerImage, stickerImageFromJson, stickerImageToJson } from "./StickerImage";

const MAX_RECENTS = 30;
const listeners = new Set<() => void>();

/** Recent stickers and GIFs belong to this device, so they live in local storage, per account. */
function storageKey(kind: "stickers" | "gifs", userId: string): string {
    return `mx_gua_recent_${kind}_${userId}`;
}

function read(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: unknown[]): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        logger.warn("Could not store recent expressions", error);
    }
    listeners.forEach((listener) => listener());
}

function parse(json: string | null): unknown[] {
    try {
        const value = json ? JSON.parse(json) : [];
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

/** Also hears other tabs, whose writes arrive as storage events. */
function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
    };
}

/** Moves `item` to the front, keeping at most 30. */
export function pushRecent<T>(items: T[], item: T, sameAs: (a: T, b: T) => boolean): T[] {
    return [item, ...items.filter((other) => !sameAs(other, item))].slice(0, MAX_RECENTS);
}

export interface Recents<T> {
    items: T[];
    push(item: T): void;
    remove(item: T): void;
}

function useRecents<T>(
    key: string,
    decode: (value: unknown) => T | undefined,
    encode: (item: T) => unknown,
    sameAs: (a: T, b: T) => boolean,
): Recents<T> {
    const json = useSyncExternalStore(subscribe, () => read(key));
    const items = useMemo(() => decodeAll(json, decode), [json, decode]);
    // Edits read storage again, so two sends before a re-render both land.
    const current = (): T[] => decodeAll(read(key), decode);
    return {
        items,
        push: (item) => write(key, pushRecent(current(), item, sameAs).map(encode)),
        remove: (item) =>
            write(
                key,
                current()
                    .filter((other) => !sameAs(other, item))
                    .map(encode),
            ),
    };
}

interface RecentsKind<T> {
    key: (userId: string) => string;
    decode: (value: unknown) => T | undefined;
    encode: (item: T) => unknown;
    sameAs: (a: T, b: T) => boolean;
}

const STICKERS: RecentsKind<StickerImage> = {
    key: (userId) => storageKey("stickers", userId),
    decode: (value) => stickerImageFromJson(value),
    encode: stickerImageToJson,
    sameAs: (a, b) => a.url === b.url,
};

const GIFS: RecentsKind<string> = {
    key: (userId) => storageKey("gifs", userId),
    decode: (value) => (typeof value === "string" ? value : undefined),
    encode: (id) => id,
    sameAs: (a, b) => a === b,
};

export function useRecentStickers(userId: string): Recents<StickerImage> {
    return useRecents(STICKERS.key(userId), STICKERS.decode, STICKERS.encode, STICKERS.sameAs);
}

export function useRecentGifs(userId: string): Recents<string> {
    return useRecents(GIFS.key(userId), GIFS.decode, GIFS.encode, GIFS.sameAs);
}

/** For senders that outlive the panel, such as the sticker editor. */
export function pushRecentSticker(userId: string, image: StickerImage): void {
    const key = STICKERS.key(userId);
    const items = decodeAll(read(key), STICKERS.decode);
    write(key, pushRecent(items, image, STICKERS.sameAs).map(STICKERS.encode));
}

function decodeAll<T>(json: string | null, decode: (value: unknown) => T | undefined): T[] {
    return parse(json)
        .map(decode)
        .filter((item): item is T => item !== undefined);
}
