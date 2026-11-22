/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type ReactNode } from "react";
import classNames from "classnames";
import CheckCircleSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/check-circle-solid";

import { _t } from "../../../languageHandler";
import { getArtwork, isLive } from "../model/artworks";
import { bubbleColour } from "../model/bubbles";
import { themeName, wallpaperName } from "../model/names";
import { type ChatTheme, shownBubble, type Wallpaper } from "../model/types";
import { WallpaperThumbnail } from "../render/WallpaperLayer";
import { type Appearance } from "../state/useAppearance";

/** The tile's CSS size, which its thumbnail is drawn for. */
export const TILE_WIDTH = 84;
export const TILE_HEIGHT = 182;

function isLiveWallpaper(wallpaper: Wallpaper): boolean {
    return wallpaper.kind === "art" && isLive(getArtwork(wallpaper.art));
}

/**
 * One section of a choice made with native radio buttons. All the sections of one choice share a radio name, so the
 * arrow keys move through every option, skip disabled ones, and pick as they go, which only previews here.
 */
export function TileGroup({
    labelledBy,
    label,
    className,
    children,
}: {
    labelledBy?: string;
    label?: string;
    className?: string;
    children: ReactNode;
}): JSX.Element {
    return (
        <div
            className={classNames("mx_GuaThemeTiles", className)}
            role="radiogroup"
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : label}
        >
            {children}
        </div>
    );
}

interface TileProps {
    /** The radio name shared by every tile of one choice. */
    group: string;
    wallpaper: Wallpaper;
    /** The tile's bubbles; a wallpaper picker tile shows the bubbles it would keep. */
    bubbles: ChatTheme;
    /** Only the Default and Classic tiles carry a visible name. */
    name?: string;
    /** The option being previewed, or the saved one when nothing is. */
    selected: boolean;
    /** The native radio's state: a selected option shown twice is checked only once. Defaults to `selected`. */
    checked?: boolean;
    /** The saved option, marked while another one is previewed. */
    current?: boolean;
    disabled?: boolean;
    appearance: Appearance;
    onSelect: () => void;
}

/** A small phone-shaped sample of a theme: its wallpaper with two bubbles. Live artworks show their still. */
export function ThemeSample({
    wallpaper,
    bubbles,
    name,
    appearance,
}: Pick<TileProps, "wallpaper" | "bubbles" | "name" | "appearance">): JSX.Element {
    const outgoing = bubbleColour(shownBubble(bubbles, appearance.dark), appearance.dark);
    return (
        <>
            <WallpaperThumbnail wallpaper={wallpaper} appearance={appearance} width={TILE_WIDTH} height={TILE_HEIGHT} />
            <span className="mx_GuaThemeTile_bubbles" aria-hidden={true}>
                <span className="mx_GuaThemeTile_incoming" />
                <span
                    className="mx_GuaThemeTile_outgoing"
                    style={outgoing ? { backgroundColor: outgoing } : undefined}
                />
            </span>
            {isLiveWallpaper(wallpaper) && (
                <span className="mx_GuaThemeTile_badge" aria-hidden={true}>
                    {_t("gua|chat_theme|live_badge")}
                </span>
            )}
            {name && (
                <span className="mx_GuaThemeTile_name" aria-hidden={true}>
                    {name}
                </span>
            )}
        </>
    );
}

export function tileLabel(wallpaper: Wallpaper, bubbles: ChatTheme, dark: boolean, name?: string): string {
    const label = name ?? (wallpaper.kind === "none" ? themeName(bubbles, dark) : wallpaperName(wallpaper));
    return isLiveWallpaper(wallpaper) ? `${label}, ${_t("gua|chat_theme|live_badge")}` : label;
}

export function ChatThemeTile(props: TileProps): JSX.Element {
    const { group, wallpaper, bubbles, name, selected, checked, current, disabled, appearance, onSelect } = props;
    const label = tileLabel(wallpaper, bubbles, appearance.dark, name);
    return (
        <label
            className={classNames("mx_GuaThemeTile", {
                mx_GuaThemeTile_selected: selected,
                mx_GuaThemeTile_disabled: disabled,
            })}
        >
            <input
                type="radio"
                className="mx_GuaThemeTile_input"
                name={group}
                checked={checked ?? selected}
                disabled={disabled}
                aria-label={current ? `${label}, ${_t("gua|chat_theme|current")}` : label}
                onChange={onSelect}
            />
            <ThemeSample wallpaper={wallpaper} bubbles={bubbles} name={name} appearance={appearance} />
            {current && (
                <span className="mx_GuaThemeTile_current" aria-hidden={true}>
                    {_t("gua|chat_theme|current")}
                </span>
            )}
            {selected && <CheckCircleSolidIcon className="mx_GuaThemeTile_check" aria-hidden={true} />}
        </label>
    );
}
