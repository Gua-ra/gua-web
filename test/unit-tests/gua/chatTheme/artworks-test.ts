/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import manifest from "../../../../res/img/gua/wallpapers/manifest.json";
import { ARTWORKS, isLive } from "../../../../src/gua/chatTheme/model/artworks";
import { BUBBLE_IDS } from "../../../../src/gua/chatTheme/model/bubbles";
import { ARTWORK_NAMES, BUBBLE_NAMES, PRESET_NAMES } from "../../../../src/gua/chatTheme/model/names";
import { ORIGINAL_TEN, PRESET_IDS } from "../../../../src/gua/chatTheme/model/presets";
import { LIVE_SHADERS } from "../../../../src/gua/chatTheme/live/liveShaders";
import en from "../../../../src/i18n/strings/en_EN.json";

const ROOT = path.resolve(__dirname, "../../../..");
const WALLPAPERS = path.join(ROOT, "res/img/gua/wallpapers");
const SHADERS = path.join(ROOT, "src/gua/chatTheme/live/shaders");

const sha256 = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function lookup(key: string): unknown {
    return key.split("|").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
}

describe("artworks", () => {
    it("match the manifest shared with the apps", () => {
        expect(
            ARTWORKS.map((a) => ({
                id: a.id,
                section: a.section,
                live: isLive(a),
                anchor: a.anchor,
                fallback_preset: a.fallback,
                bubble: { light: a.bubble, dark: "bubbleDark" in a ? a.bubbleDark : a.bubble },
                still_time: "stillTime" in a ? a.stillTime : undefined,
            })),
        ).toEqual(
            manifest.artworks.map((a) => ({
                id: a.id,
                section: a.section,
                live: a.live,
                anchor: a.anchor,
                fallback_preset: a.fallback_preset,
                bubble: a.bubble,
                still_time: "still_time" in a ? a.still_time : undefined,
            })),
        );
    });

    it("ship every still in the manifest unchanged, and nothing else", () => {
        const expected = new Set(["manifest.json", manifest.noise.file]);
        for (const artwork of manifest.artworks) {
            for (const file of [artwork.files.light, artwork.files.dark]) {
                expected.add(file);
                expect([file, sha256(path.join(WALLPAPERS, file))]).toEqual([
                    file,
                    artwork.sha256[file as keyof typeof artwork.sha256],
                ]);
            }
        }
        expect(sha256(path.join(WALLPAPERS, manifest.noise.file))).toBe(manifest.noise.sha256);
        expect(new Set(fs.readdirSync(WALLPAPERS))).toEqual(expected);
    });

    it("fall back to one of the presets every build knows", () => {
        for (const artwork of ARTWORKS) expect(ORIGINAL_TEN).toContain(artwork.fallback);
    });

    it("have one shader per live artwork", () => {
        const live = ARTWORKS.filter(isLive).map((a) => a.id);
        expect([...LIVE_SHADERS.keys()].sort()).toEqual([...live].sort());
        expect(
            fs
                .readdirSync(SHADERS)
                .filter((f) => f.endsWith(".frag"))
                .sort(),
        ).toEqual(live.map((id) => `${id}.frag`).sort());
    });

    it("name every artwork, preset and bubble", () => {
        for (const artwork of ARTWORKS) expect(lookup(ARTWORK_NAMES[artwork.id])).toEqual(expect.any(String));
        for (const preset of PRESET_IDS) expect(lookup(PRESET_NAMES[preset])).toEqual(expect.any(String));
        for (const bubble of BUBBLE_IDS) expect(lookup(BUBBLE_NAMES[bubble])).toEqual(expect.any(String));
        expect(lookup(ARTWORK_NAMES.guara)).toBe("Guará");
    });
});
