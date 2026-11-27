/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type ChatTheme, isStock } from "./types";

/** Like the apps and unlike `useMediaVisible`, this counts `knock_restricted` as private; unknown rules count as public. */
const PRIVATE_JOIN_RULES = new Set(["invite", "knock", "restricted", "knock_restricted"]);

export function isPrivateJoinRule(joinRule: string | null | undefined): boolean {
    return !!joinRule && PRIVATE_JOIN_RULES.has(joinRule);
}

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

/** A chat photo hidden by the media setting falls back to the whole default theme, whose own photo always shows. */
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
