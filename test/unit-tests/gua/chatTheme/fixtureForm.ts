/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type ArtworkId } from "../../../../src/gua/chatTheme/model/artworks";
import { type BubbleId } from "../../../../src/gua/chatTheme/model/bubbles";
import { type PresetId } from "../../../../src/gua/chatTheme/model/presets";
import { type ChatTheme, makeTheme, type Wallpaper } from "../../../../src/gua/chatTheme/model/types";

/** A theme in the shared fixtures' `expected` form. */
export interface FixtureTheme {
    kind: string;
    preset?: string;
    art?: string;
    photo?: {
        url: string;
        mimetype: string;
        w: number;
        h: number;
        size: number;
        blurhash: string | null;
        dim: number;
        align: { x: number; y: number };
    };
    bubble?: string;
    bubble_dark?: string;
}

export function toFixture(theme: ChatTheme): FixtureTheme {
    const { wallpaper } = theme;
    const fixture: FixtureTheme = { kind: wallpaper.kind };
    if (wallpaper.kind === "preset") fixture.preset = wallpaper.preset;
    if (wallpaper.kind === "art") fixture.art = wallpaper.art;
    if (wallpaper.kind === "photo") {
        const { alignX, alignY, ...photo } = wallpaper.photo;
        fixture.photo = { ...photo, align: { x: alignX, y: alignY } };
    }
    if (theme.bubble !== "standard") fixture.bubble = theme.bubble;
    if (theme.bubbleDark) fixture.bubble_dark = theme.bubbleDark;
    return fixture;
}

export function fromFixture(fixture: FixtureTheme): ChatTheme {
    let wallpaper: Wallpaper;
    switch (fixture.kind) {
        case "preset":
            wallpaper = { kind: "preset", preset: fixture.preset as PresetId };
            break;
        case "art":
            wallpaper = { kind: "art", art: fixture.art as ArtworkId };
            break;
        case "photo": {
            const { align, ...photo } = fixture.photo!;
            wallpaper = { kind: "photo", photo: { ...photo, alignX: align.x, alignY: align.y } };
            break;
        }
        default:
            wallpaper = { kind: "none" };
    }
    return makeTheme(
        wallpaper,
        (fixture.bubble ?? "standard") as BubbleId,
        fixture.bubble_dark as BubbleId | undefined,
    );
}
