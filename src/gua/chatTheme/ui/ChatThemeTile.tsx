/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type KeyboardEvent, type ReactNode } from "react";
import classNames from "classnames";
import CheckCircleSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/check-circle-solid";

import { _t } from "../../../languageHandler";
import { getArtwork, isLive } from "../model/artworks";
import { bubbleColour } from "../model/bubbles";
import { themeName, wallpaperName } from "../model/names";
import { type ChatTheme, shownBubble, type Wallpaper } from "../model/types";
import { WallpaperLayer } from "../render/WallpaperLayer";
import { type Appearance } from "../state/useAppearance";

function isLiveWallpaper(wallpaper: Wallpaper): boolean {
    return wallpaper.kind === "art" && isLive(getArtwork(wallpaper.art));
}

/** Arrow keys move between the tiles of one group; only the selected tile, or else the first, takes a Tab stop. */
function onRadioKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='radio']"));
    const index = radios.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    let next: number | undefined;
    if (event.key in keys) next = (index + keys[event.key] + radios.length) % radios.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = radios.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    radios[next].focus();
}

export function TileGroup({ label, children }: { label: string; children: ReactNode }): JSX.Element {
    return (
        <div className="mx_GuaThemeTiles" role="radiogroup" aria-label={label} onKeyDown={onRadioKeyDown}>
            {children}
        </div>
    );
}

interface TileProps {
    wallpaper: Wallpaper;
    /** The tile's bubbles; a wallpaper picker tile shows the bubbles it would keep. */
    bubbles: ChatTheme;
    /** Only the Default and Classic tiles carry a visible name. */
    name?: string;
    selected: boolean;
    focusable: boolean;
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
            <WallpaperLayer wallpaper={wallpaper} appearance={appearance} lazy />
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
    const { wallpaper, bubbles, name, selected, focusable, disabled, appearance, onSelect } = props;
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={tileLabel(wallpaper, bubbles, appearance.dark, name)}
            tabIndex={focusable ? 0 : -1}
            disabled={disabled}
            className={classNames("mx_Dialog_nonDialogButton mx_GuaThemeTile", { mx_GuaThemeTile_selected: selected })}
            onClick={onSelect}
        >
            <ThemeSample wallpaper={wallpaper} bubbles={bubbles} name={name} appearance={appearance} />
            {selected && <CheckCircleSolidIcon className="mx_GuaThemeTile_check" aria-hidden={true} />}
        </button>
    );
}
