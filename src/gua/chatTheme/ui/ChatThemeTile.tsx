/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type ReactNode, useId } from "react";
import classNames from "classnames";
import CheckCircleSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/check-circle-solid";

import { _t } from "../../../languageHandler";
import { getArtwork, isLive } from "../model/artworks";
import { bubbleColour } from "../model/bubbles";
import { photoCreditText, themeName, wallpaperName } from "../model/names";
import { type ChatTheme, photoCredit, shownBubble, type Wallpaper } from "../model/types";
import { WallpaperThumbnail } from "../render/WallpaperLayer";
import { type Appearance } from "../state/useAppearance";

/** The tile's size in _ChatTheme.pcss, which the thumbnail is drawn at. */
const TILE_WIDTH = 84;
const TILE_HEIGHT = 182;

export function isLiveWallpaper(wallpaper: Wallpaper): boolean {
    return wallpaper.kind === "art" && isLive(getArtwork(wallpaper.art));
}

/**
 * All sections of one choice share a radio name, so the arrow keys move through every option. They also pick as they
 * go, which is fine because picking only previews.
 */
export function TileGroup({
    labelledBy,
    label,
    children,
}: {
    labelledBy?: string;
    label?: string;
    children: ReactNode;
}): JSX.Element {
    return (
        <div
            className="mx_GuaThemeTiles"
            role="radiogroup"
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : label}
        >
            {children}
        </div>
    );
}

interface TileProps {
    group: string;
    wallpaper: Wallpaper;
    bubbles: ChatTheme;
    name?: string;
    /** Previewed, or saved when nothing is previewed. */
    selected: boolean;
    /** Defaults to `selected`; an option shown twice is checked only once. */
    checked?: boolean;
    /** The saved option, marked while a preview is shown. */
    current?: boolean;
    disabled?: boolean;
    appearance: Appearance;
    onSelect: () => void;
}

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
    if (isLiveWallpaper(wallpaper)) return `${label}, ${_t("gua|chat_theme|live_badge")}`;
    const credit = photoCredit(wallpaper);
    return credit ? `${label}, ${photoCreditText(credit)}` : label;
}

export function ChatThemeTile(props: TileProps): JSX.Element {
    const { group, wallpaper, bubbles, name, selected, checked, current, disabled, appearance, onSelect } = props;
    const label = tileLabel(wallpaper, bubbles, appearance.dark, name);
    const inputId = useId();
    const credit = photoCredit(wallpaper);
    const tile = (
        <label
            className={classNames("mx_GuaThemeTile", {
                mx_GuaThemeTile_selected: selected,
                mx_GuaThemeTile_disabled: disabled,
            })}
        >
            <input
                id={inputId}
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
    if (!credit) return tile;
    return (
        <div className="mx_GuaThemeTile_photo">
            {tile}
            <label htmlFor={inputId} className="mx_GuaThemeTile_caption" aria-hidden={true}>
                <span className="mx_GuaThemeTile_captionName">{wallpaperName(wallpaper)}</span>
                {photoCreditText(credit)}
            </label>
        </div>
    );
}
