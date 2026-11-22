/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { BUBBLE_COLOURS } from "../model/bubbles";
import { type VisibleChat } from "../model/layout";
import { SendPulse } from "../live/timing";
import { useSendPulse } from "../live/useSendPulse";
import { useAppearance } from "../state/useAppearance";
import { useChatThemesFeature, useEffectiveChatTheme, useIsBubbleLayout } from "../state/useEffectiveChatTheme";
import { WallpaperLayer } from "./WallpaperLayer";

interface Props {
    room: Room;
    /** The room's `mx_RoomView_body`, which carries the theme for the timeline's CSS. */
    bodyRef: RefObject<HTMLDivElement | null>;
}

const WALLPAPER_ATTRIBUTE = "data-gua-wallpaper";
const BUBBLE_ATTRIBUTE = "data-gua-bubble";
const BUBBLE_LIGHT = "--gua-bubble-light";
const BUBBLE_DARK = "--gua-bubble-dark";

function ThemedChat({ room, bodyRef }: Props): JSX.Element | null {
    const client = useMatrixClientContext();
    const effective = useEffectiveChatTheme(client, room);
    const appearance = useAppearance();
    const [pulse] = useState(() => new SendPulse());
    const [pulseCount, setPulseCount] = useState(0);

    const hasWallpaper = effective.wallpaper.kind !== "none";
    const light = effective.bubble === "standard" ? undefined : BUBBLE_COLOURS[effective.bubble].light;
    const darkBubble = effective.bubbleDark ?? effective.bubble;
    const dark = darkBubble === "standard" ? undefined : BUBBLE_COLOURS[darkBubble].dark;

    // The body is an ancestor, so its ref is attached only after this component's first layout effect.
    const [bodyMounted, setBodyMounted] = useState(false);
    useEffect(() => {
        if (!bodyMounted && bodyRef.current) setBodyMounted(true);
    }, [bodyMounted, bodyRef]);

    useLayoutEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        if (hasWallpaper) body.setAttribute(WALLPAPER_ATTRIBUTE, "");
        if (light && dark) {
            body.setAttribute(BUBBLE_ATTRIBUTE, "");
            body.style.setProperty(BUBBLE_LIGHT, light);
            body.style.setProperty(BUBBLE_DARK, dark);
        }
        return () => {
            body.removeAttribute(WALLPAPER_ATTRIBUTE);
            body.removeAttribute(BUBBLE_ATTRIBUTE);
            body.style.removeProperty(BUBBLE_LIGHT);
            body.style.removeProperty(BUBBLE_DARK);
            if (!body.getAttribute("style")) body.removeAttribute("style");
        };
    }, [bodyRef, bodyMounted, hasWallpaper, light, dark]);

    const onSend = useCallback(() => {
        pulse.send(performance.now());
        setPulseCount((count) => count + 1);
    }, [pulse]);
    useSendPulse(client, room, onSend);

    /** The timeline column, between the room header and the composer. */
    const visibleChat = useCallback((): VisibleChat => {
        const body = bodyRef.current;
        const timeline = body?.querySelector(".mx_RoomView_timeline");
        const bodyRect = body?.getBoundingClientRect();
        if (!bodyRect || !timeline)
            return { left: 0, right: bodyRect?.width ?? 0, top: 0, bottom: bodyRect?.height ?? 0 };
        const rect = timeline.getBoundingClientRect();
        return {
            left: rect.left - bodyRect.left,
            right: rect.right - bodyRect.left,
            top: rect.top - bodyRect.top,
            bottom: rect.bottom - bodyRect.top,
        };
    }, [bodyRef]);

    const live = useMemo(() => ({ inDialog: false, pulse, pulseCount, visibleChat }), [pulse, pulseCount, visibleChat]);

    if (!hasWallpaper) return null;
    return (
        <WallpaperLayer
            wallpaper={effective.wallpaper}
            appearance={appearance}
            live={live}
            className="mx_GuaChatWallpaper"
        />
    );
}

/**
 * The chat theme behind the timeline. With themes off, outside the bubble layout, or for a chat with no theme it
 * renders nothing and leaves the room's markup as it was.
 */
export function ChatWallpaper(props: Props): JSX.Element | null {
    const enabled = useChatThemesFeature();
    const bubbleLayout = useIsBubbleLayout();
    if (!enabled || !bubbleLayout) return null;
    return <ThemedChat {...props} />;
}
