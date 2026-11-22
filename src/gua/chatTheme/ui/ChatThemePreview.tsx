/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useMemo, useState } from "react";
import { IconButton } from "@vector-im/compound-web";
import SendSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/send-solid";

import { _t } from "../../../languageHandler";
import { bubbleColour } from "../model/bubbles";
import { themeName } from "../model/names";
import { type ChatTheme, shownBubble } from "../model/types";
import { SendPulse, type WallpaperMotion } from "../live/timing";
import { WallpaperLayer } from "../render/WallpaperLayer";
import { type Appearance } from "../state/useAppearance";
import { isLiveWallpaper } from "./ChatThemeTile";

interface Props {
    theme: ChatTheme;
    appearance: Appearance;
    live?: boolean;
    localPhoto?: ImageBitmap;
}

/**
 * The send button shows only while the artwork moves, not while reduced motion, a failed shader or slow frames hold
 * it still.
 */
export function ChatThemePreview({ theme, appearance, live, localPhoto }: Props): JSX.Element {
    const [pulse] = useState(() => new SendPulse());
    const [motion, setMotion] = useState<WallpaperMotion>("still");
    const animates = live && isLiveWallpaper(theme.wallpaper);
    const liveOptions = useMemo(() => ({ inDialog: true, pulse, onMotion: setMotion }), [pulse]);
    const outgoing = bubbleColour(shownBubble(theme, appearance.dark), appearance.dark);

    return (
        <div
            className="mx_GuaThemePreview"
            role="group"
            aria-label={`${_t("gua|chat_theme|preview_label")}: ${themeName(theme, appearance.dark)}`}
        >
            <WallpaperLayer
                wallpaper={theme.wallpaper}
                appearance={appearance}
                live={animates ? liveOptions : undefined}
                localPhoto={localPhoto}
            />
            <div className="mx_GuaThemePreview_messages" aria-hidden={true}>
                <span className="mx_GuaThemePreview_day">{_t("gua|chat_theme|sample|today")}</span>
                <span className="mx_GuaThemePreview_bubble mx_GuaThemePreview_incoming">
                    {_t("gua|chat_theme|sample|incoming")}
                </span>
                <span
                    className="mx_GuaThemePreview_bubble mx_GuaThemePreview_outgoing"
                    style={outgoing ? { backgroundColor: outgoing } : undefined}
                >
                    {_t("gua|chat_theme|sample|outgoing")}
                </span>
            </div>
            {animates && motion !== "still" && (
                <IconButton
                    className="mx_Dialog_nonDialogButton mx_GuaThemePreview_send"
                    size="32px"
                    kind="primary"
                    tooltip={_t("gua|chat_theme|preview_send")}
                    onClick={() => pulse.send(performance.now())}
                >
                    <SendSolidIcon />
                </IconButton>
            )}
        </div>
    );
}
