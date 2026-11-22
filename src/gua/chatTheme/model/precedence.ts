/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type ChatTheme, isStock } from "./types";

/** Matches the apps, so unlike `useMediaVisible` it counts `knock_restricted`; an unknown join rule counts as public. */
const PRIVATE_JOIN_RULES = new Set(["invite", "knock", "restricted", "knock_restricted"]);

export function isPrivateJoinRule(joinRule: string | null | undefined): boolean {
    return !!joinRule && PRIVATE_JOIN_RULES.has(joinRule);
}

/** The media previews setting (MSC4278) applied to a chat: `private` shows media only in private chats. */
export function isMediaShown(mediaPreviews: string | undefined, roomIsPrivate: boolean): boolean {
    switch (mediaPreviews) {
        case "off":
            return false;
        case "private":
            return roomIsPrivate;
        default:
            return true;
    }
}

/**
 * What a chat shows. A chat photo the media setting hides hands over to the default as a whole, whose own photo
 * always shows.
 */
export function effectiveChatTheme(
    chatTheme: ChatTheme,
    defaultTheme: ChatTheme,
    roomIsPrivate: boolean,
    mediaShown: boolean,
): ChatTheme {
    if (isStock(chatTheme)) return defaultTheme;
    if (chatTheme.wallpaper.kind === "photo" && !roomIsPrivate && !mediaShown) return defaultTheme;
    return chatTheme;
}
