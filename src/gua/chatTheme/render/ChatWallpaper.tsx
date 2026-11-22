/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { BUBBLE_COLOURS } from "../model/bubbles";
import { SendPulse } from "../live/timing";
import { useSendPulse } from "../live/useSendPulse";
import { useAppearance } from "../state/useAppearance";
import { useEffectiveChatTheme } from "../state/useEffectiveChatTheme";
import { type LiveOptions, WallpaperLayer } from "./WallpaperLayer";

interface Props {
    room: Room;
    /** The room's `mx_RoomView_body`, which carries the theme for the timeline's CSS. */
    bodyRef: RefObject<HTMLDivElement | null>;
}

const WALLPAPER_ATTRIBUTE = "data-gua-wallpaper";
const BUBBLE_ATTRIBUTE = "data-gua-bubble";
const BUBBLE_LIGHT = "--gua-bubble-light";
const BUBBLE_DARK = "--gua-bubble-dark";

export default function ThemedChat({ room, bodyRef }: Props): JSX.Element | null {
    const client = useMatrixClientContext();
    const effective = useEffectiveChatTheme(client, room);
    const appearance = useAppearance();
    const [pulse] = useState(() => new SendPulse());

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
        // The bubble colour goes on the whole room, so threads in the right panel get it too.
        const roomView = body.closest<HTMLElement>(".mx_RoomView") ?? body;
        if (hasWallpaper) body.setAttribute(WALLPAPER_ATTRIBUTE, "");
        if (light && dark) {
            roomView.setAttribute(BUBBLE_ATTRIBUTE, "");
            roomView.style.setProperty(BUBBLE_LIGHT, light);
            roomView.style.setProperty(BUBBLE_DARK, dark);
        }
        return () => {
            body.removeAttribute(WALLPAPER_ATTRIBUTE);
            roomView.removeAttribute(BUBBLE_ATTRIBUTE);
            roomView.style.removeProperty(BUBBLE_LIGHT);
            roomView.style.removeProperty(BUBBLE_DARK);
            if (!roomView.getAttribute("style")) roomView.removeAttribute("style");
        };
    }, [bodyRef, bodyMounted, hasWallpaper, light, dark]);

    const onSend = useCallback(() => pulse.send(performance.now()), [pulse]);
    useSendPulse(client, room, onSend);

    const live = useMemo<LiveOptions>(() => ({ inDialog: false, pulse }), [pulse]);

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
