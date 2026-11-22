/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, lazy, type RefObject, Suspense } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import Spinner from "../../components/views/elements/Spinner";
import { useChatThemesFeature, useIsBubbleLayout } from "./state/flags";

// Element's views reach chat themes only through these gates, which import nothing else of them: the main bundle
// carries the gates and the timeline notice, and the rest loads as one chunk where themes are on.

const ThemedChat = lazy(() => import(/* webpackChunkName: "gua-chat-theme" */ "./render/ChatWallpaper"));
const RoomSettingsTab = lazy(() => import(/* webpackChunkName: "gua-chat-theme" */ "./ui/ChatThemeRoomSettingsTab"));
const DefaultSettings = lazy(() => import(/* webpackChunkName: "gua-chat-theme" */ "./ui/ChatThemeDefaultSettings"));

/**
 * The chat theme behind the timeline, mounted in the timeline column. With themes off or outside the bubble layout
 * it renders nothing and leaves the room's markup as it was.
 */
export function ChatThemeWallpaper(props: {
    room: Room;
    bodyRef: RefObject<HTMLDivElement | null>;
}): JSX.Element | null {
    const enabled = useChatThemesFeature();
    const bubbleLayout = useIsBubbleLayout();
    if (!enabled || !bubbleLayout) return null;
    return (
        <Suspense fallback={null}>
            <ThemedChat {...props} />
        </Suspense>
    );
}

export function ChatThemeRoomSettingsTab(props: { room: Room }): JSX.Element {
    return (
        <Suspense fallback={<Spinner />}>
            <RoomSettingsTab {...props} />
        </Suspense>
    );
}

/** The personal default in the Appearance settings, only with chat themes on. */
export function ChatThemeDefaultSettings(): JSX.Element | null {
    if (!useChatThemesFeature()) return null;
    return (
        <Suspense fallback={<Spinner />}>
            <DefaultSettings />
        </Suspense>
    );
}
