/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useMemo, useRef } from "react";
import classNames from "classnames";

import { getArtwork, isLive } from "../model/artworks";
import { stillUrl, thumbnailUrl } from "../model/artworkAssets";
import { presetBackground } from "../model/presetFill";
import { isGradient, presetFill } from "../model/presets";
import { type Wallpaper } from "../model/types";
import { LiveWallpaperCanvas } from "../live/LiveWallpaperCanvas";
import { type SendPulse, type WallpaperMotion } from "../live/timing";
import { type Appearance } from "../state/useAppearance";
import { type Size, useCrossfade, useDevicePixelRatio, useElementSize } from "./hooks";
import { PhotoLayer } from "./PhotoLayer";

const CROSSFADE_MS = 200;
/** The noise tile's side in image pixels, drawn at one image pixel per device pixel. */
const GRAIN_TILE = 128;

export interface LiveOptions {
    inDialog: boolean;
    pulse?: SendPulse;
    onMotion?: (motion: WallpaperMotion) => void;
}

interface FillProps {
    wallpaper: Wallpaper;
    appearance: Appearance;
    size: Size;
    /** Without it a live artwork shows its still. */
    live?: LiveOptions & { frozen?: boolean };
    thumbnail?: boolean;
    small?: boolean;
    localPhoto?: ImageBitmap;
}

function wallpaperKey(wallpaper: Wallpaper): string {
    switch (wallpaper.kind) {
        case "none":
            return "none";
        case "preset":
            return `preset:${wallpaper.preset}`;
        case "art":
            return `art:${wallpaper.art}`;
        case "photo":
            return `photo:${wallpaper.photo.url}`;
    }
}

function Grain(): JSX.Element {
    const ratio = useDevicePixelRatio();
    const side = `${GRAIN_TILE / ratio}px`;
    return <div className="mx_GuaWallpaper_grain" style={{ backgroundSize: `${side} ${side}` }} />;
}

function LightScrim({ appearance }: { appearance: Appearance }): JSX.Element | null {
    return !appearance.dark && appearance.increasedContrast ? (
        <div className="mx_GuaWallpaper_scrim" style={{ opacity: 0.06 }} />
    ) : null;
}

function WallpaperFill({ wallpaper, size, appearance, live, thumbnail, small, localPhoto }: FillProps): JSX.Element {
    const { dark } = appearance;
    switch (wallpaper.kind) {
        case "none":
            return <div className="mx_GuaWallpaper_fill mx_GuaWallpaper_none" />;
        case "preset": {
            const fill = presetFill(wallpaper.preset, dark);
            return (
                <>
                    <div
                        className="mx_GuaWallpaper_fill"
                        style={{ background: presetBackground(fill, size.width, size.height) }}
                    />
                    {isGradient(fill) && !thumbnail && <Grain />}
                    <LightScrim appearance={appearance} />
                </>
            );
        }
        case "art": {
            const artwork = getArtwork(wallpaper.art);
            const fallback = presetFill(artwork.fallback, dark);
            const animates = live && isLive(artwork) && size.width > 0 && size.height > 0;
            return (
                <>
                    <div
                        className="mx_GuaWallpaper_fill"
                        style={{ background: presetBackground(fallback, size.width, size.height) }}
                    />
                    <img
                        className="mx_GuaWallpaper_still"
                        src={thumbnail ? thumbnailUrl(artwork.id, dark) : stillUrl(artwork.id, dark)}
                        alt=""
                        loading={thumbnail ? "lazy" : "eager"}
                        decoding="async"
                        draggable={false}
                        style={{ objectPosition: `${artwork.anchor.x * 100}% ${artwork.anchor.y * 100}%` }}
                    />
                    {animates && (
                        <LiveWallpaperCanvas
                            key={artwork.id}
                            artwork={artwork}
                            dark={dark}
                            width={size.width}
                            height={size.height}
                            {...live}
                        />
                    )}
                    {!thumbnail && <Grain />}
                    <LightScrim appearance={appearance} />
                </>
            );
        }
        case "photo":
            return (
                <>
                    <div className="mx_GuaWallpaper_fill mx_GuaWallpaper_none" />
                    <PhotoLayer
                        photo={wallpaper.photo}
                        size={size}
                        dark={dark}
                        increasedContrast={appearance.increasedContrast}
                        small={small}
                        local={localPhoto}
                    />
                </>
            );
    }
}

interface Props {
    wallpaper: Wallpaper;
    appearance: Appearance;
    live?: LiveOptions;
    small?: boolean;
    localPhoto?: ImageBitmap;
    className?: string;
}

export function WallpaperLayer({ wallpaper, appearance, live, small, localPhoto, className }: Props): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const size = useElementSize(ref);
    const layers = useCrossfade(wallpaperKey(wallpaper), wallpaper, CROSSFADE_MS);
    const frozen = useMemo(() => live && { ...live, frozen: true, onMotion: undefined }, [live]);
    return (
        <div ref={ref} className={classNames("mx_GuaWallpaper", className)} aria-hidden={true}>
            {layers.map((layer, index) => {
                const isTop = index === layers.length - 1;
                return (
                    <div
                        key={layer.key}
                        className={classNames("mx_GuaWallpaper_layer", {
                            mx_GuaWallpaper_layer_entering: isTop && layers.length > 1,
                        })}
                    >
                        <WallpaperFill
                            wallpaper={layer.value}
                            size={size}
                            appearance={appearance}
                            live={isTop ? live : frozen}
                            small={small}
                            localPhoto={isTop ? localPhoto : undefined}
                        />
                    </div>
                );
            })}
        </div>
    );
}

export function WallpaperThumbnail({
    wallpaper,
    appearance,
    width,
    height,
    className,
}: {
    wallpaper: Wallpaper;
    appearance: Appearance;
    width: number;
    height: number;
    className?: string;
}): JSX.Element {
    const size = useMemo(() => ({ width, height }), [width, height]);
    return (
        <div className={classNames("mx_GuaWallpaper", className)} aria-hidden={true}>
            <div className="mx_GuaWallpaper_layer">
                <WallpaperFill wallpaper={wallpaper} size={size} appearance={appearance} thumbnail small />
            </div>
        </div>
    );
}
