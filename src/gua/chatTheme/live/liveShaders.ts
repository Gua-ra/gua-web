/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*!
 * The live wallpaper shaders' hash12 and hash22 are "Hash without Sine" by David Hoskins, used under the MIT licence:
 *
 * Copyright (c) 2014 David Hoskins.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { type ArtworkId } from "../model/artworks";

type ShaderLoader = () => Promise<{ default: string }>;

/** One lazy chunk per shader. `scripts/gua/sync-wallpapers.mjs` writes the `.frag` files from the Lab's sources. */
export const LIVE_SHADERS = new Map<ArtworkId, ShaderLoader>([
    [
        "glass-drops",
        () => import(/* webpackChunkName: "gua-live-glass-drops" */ "!!raw-loader!./shaders/glass-drops.frag"),
    ],
    [
        "glass-drops-blue",
        () =>
            import(/* webpackChunkName: "gua-live-glass-drops-blue" */ "!!raw-loader!./shaders/glass-drops-blue.frag"),
    ],
    [
        "molten-pearl",
        () => import(/* webpackChunkName: "gua-live-molten-pearl" */ "!!raw-loader!./shaders/molten-pearl.frag"),
    ],
    ["silk", () => import(/* webpackChunkName: "gua-live-silk" */ "!!raw-loader!./shaders/silk.frag")],
    ["ipe", () => import(/* webpackChunkName: "gua-live-ipe" */ "!!raw-loader!./shaders/ipe.frag")],
    [
        "rain-on-glass",
        () => import(/* webpackChunkName: "gua-live-rain-on-glass" */ "!!raw-loader!./shaders/rain-on-glass.frag"),
    ],
    ["pantanal", () => import(/* webpackChunkName: "gua-live-pantanal" */ "!!raw-loader!./shaders/pantanal.frag")],
    [
        "currents-live",
        () => import(/* webpackChunkName: "gua-live-currents-live" */ "!!raw-loader!./shaders/currents-live.frag"),
    ],
    ["boreal", () => import(/* webpackChunkName: "gua-live-boreal" */ "!!raw-loader!./shaders/boreal.frag")],
    ["lagoon", () => import(/* webpackChunkName: "gua-live-lagoon" */ "!!raw-loader!./shaders/lagoon.frag")],
    [
        "sea-sparks",
        () => import(/* webpackChunkName: "gua-live-sea-sparks" */ "!!raw-loader!./shaders/sea-sparks.frag"),
    ],
    [
        "tropic-dusk",
        () => import(/* webpackChunkName: "gua-live-tropic-dusk" */ "!!raw-loader!./shaders/tropic-dusk.frag"),
    ],
]);
