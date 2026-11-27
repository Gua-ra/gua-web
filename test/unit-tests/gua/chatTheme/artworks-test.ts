/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import manifest from "../../../../res/img/gua/wallpapers/manifest.json";
import {
    type Artwork,
    ARTWORKS,
    darkDim,
    getArtwork,
    isLive,
    PHOTO_LICENCE_URLS,
    type PhotoLicence,
    photoCredits,
} from "../../../../src/gua/chatTheme/model/artworks";
import { BUBBLE_IDS } from "../../../../src/gua/chatTheme/model/bubbles";
import { ARTWORK_NAMES, BUBBLE_NAMES, PRESET_NAMES } from "../../../../src/gua/chatTheme/model/names";
import { ORIGINAL_TEN, PRESET_IDS } from "../../../../src/gua/chatTheme/model/presets";
import { LIVE_SHADERS } from "../../../../src/gua/chatTheme/live/liveShaders";
import en from "../../../../src/i18n/strings/en_EN.json";
import es from "../../../../src/i18n/strings/es.json";
import fr from "../../../../src/i18n/strings/fr.json";
import ptBR from "../../../../src/i18n/strings/pt_BR.json";

const ROOT = path.resolve(__dirname, "../../../..");
const WALLPAPERS = path.join(ROOT, "res/img/gua/wallpapers");
const SHADERS = path.join(ROOT, "src/gua/chatTheme/live/shaders");

const sha256 = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function lookup(key: string, strings: object = en): unknown {
    return key.split("|").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], strings);
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

    it("credit exactly the photos, as the manifest does", () => {
        expect(
            ARTWORKS.map(({ credit }: Artwork) =>
                credit
                    ? {
                          author: credit.author,
                          licence: credit.licence,
                          licence_url: PHOTO_LICENCE_URLS[credit.licence],
                          source_url: credit.sourceUrl ?? null,
                          modified: "cropped and resized",
                      }
                    : undefined,
            ),
        ).toEqual(manifest.artworks.map((a) => ("credit" in a ? a.credit : undefined)));
        expect(PHOTO_LICENCE_URLS).toEqual({
            "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
            "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
            "All rights reserved":
                "https://github.com/Gua-ra/gua-android/blob/develop/tools/wallpapers/licenses/LicenseRef-Gabriel-Bonfa-Photo.txt",
        });
    });

    it("keep the photos in their own section, each with one still for both appearances", () => {
        for (const artwork of manifest.artworks) {
            const isPhoto = artwork.section === "photos";
            expect([artwork.id, "credit" in artwork, artwork.id.startsWith("photo-")]).toEqual([
                artwork.id,
                isPhoto,
                isPhoto,
            ]);
            const still = isPhoto ? `${artwork.id}.webp` : undefined;
            expect(artwork.files.light).toBe(still ?? `${artwork.id}-light.webp`);
            expect(artwork.files.dark).toBe(still ?? `${artwork.id}-dark.webp`);
        }
        expect(photoCredits().map((p) => p.id)).toEqual(
            ARTWORKS.filter((a) => a.section === "photos").map((a) => a.id),
        );
        expect(photoCredits()).toHaveLength(20);
    });

    it("dim a photo in dark mode like a user's own photo, and no other artwork", () => {
        for (const artwork of ARTWORKS) {
            expect([artwork.id, darkDim(artwork)]).toEqual([artwork.id, artwork.section === "photos" ? 35 : undefined]);
        }
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
        expect(new Set(fs.readdirSync(WALLPAPERS))).toEqual(
            new Set([...expected, "thumbnails", "licenses", "THIRD_PARTY_NOTICES.md"]),
        );
    });

    it("have a thumbnail for every still, and nothing else", () => {
        const stills = new Set(manifest.artworks.flatMap((a) => [a.files.light, a.files.dark]));
        expect(fs.readdirSync(path.join(WALLPAPERS, "thumbnails")).sort()).toEqual([...stills].sort());
    });

    it("list every photo in the notices, next to its licence text", () => {
        const notices = fs.readFileSync(path.join(WALLPAPERS, "THIRD_PARTY_NOTICES.md"), "utf8");
        const terms = (licence: PhotoLicence): string =>
            licence === "All rights reserved"
                ? "licenses/LicenseRef-Gabriel-Bonfa-Photo.txt"
                : PHOTO_LICENCE_URLS[licence];
        for (const { id, credit } of photoCredits()) {
            const row = notices.split("\n").find((line) => line.startsWith(`| \`${id}.webp\``));
            expect([id, row]).toEqual([id, expect.stringContaining(`| ${credit.author} `)]);
            expect(row).toContain(`[${credit.licence}](${terms(credit.licence)})`);
        }
        expect(fs.readdirSync(path.join(WALLPAPERS, "licenses")).sort()).toEqual([
            "CC-BY-4.0.txt",
            "CC0-1.0.txt",
            "LicenseRef-Gabriel-Bonfa-Photo.txt",
        ]);
    });

    it("credit Smiling Maned Wolf in the words its licence requires", () => {
        expect(getArtwork("photo-maned-wolf-smiling").credit).toEqual({
            author: "Gabriel Bonfa",
            licence: "All rights reserved",
        });
        const credit = (strings: object): unknown =>
            (lookup("gua|chat_theme|photo_credit", strings) as string).replace("%(author)s", "Gabriel Bonfa");
        expect(credit(en)).toBe("Photo: Gabriel Bonfa");
        expect(credit(ptBR)).toBe("Foto: Gabriel Bonfa");
        for (const strings of [en, ptBR, es, fr]) {
            expect(lookup("gua|chat_theme|photo_licence_all_rights_reserved", strings)).toEqual(expect.any(String));
            expect(lookup(ARTWORK_NAMES["photo-maned-wolf-smiling"], strings)).toEqual(expect.any(String));
        }
        const notice = fs.readFileSync(path.join(WALLPAPERS, "licenses/LicenseRef-Gabriel-Bonfa-Photo.txt"), "utf8");
        expect(notice).toContain('Credit: "Foto: Gabriel Bonfa"');
        expect(notice).toContain(
            "Anyone distributing a modified version of this software must remove or replace this photo.",
        );
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
        expect(lookup(ARTWORK_NAMES["photo-yukon-sled-2"])).toBe("Sled Dogs");
    });
});
