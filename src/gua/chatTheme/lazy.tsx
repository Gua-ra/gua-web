/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, lazy, type RefObject, Suspense } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import Spinner from "../../components/views/elements/Spinner";
import { useChatThemesFeature, useIsBubbleLayout } from "./state/flags";

// Upstream code imports only these wrappers, notice.ts and model/constants.ts, so the rest stays in one lazy chunk.

const ThemedChat = lazy(() => import(/* webpackChunkName: "gua-chat-theme" */ "./render/ChatWallpaper"));
const RoomSettingsTab = lazy(() => import(/* webpackChunkName: "gua-chat-theme" */ "./ui/ChatThemeRoomSettingsTab"));
const DefaultSettings = lazy(() => import(/* webpackChunkName: "gua-chat-theme" */ "./ui/ChatThemeDefaultSettings"));

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

export function ChatThemeDefaultSettings(): JSX.Element | null {
    if (!useChatThemesFeature()) return null;
    return (
        <Suspense fallback={<Spinner />}>
            <DefaultSettings />
        </Suspense>
    );
}
