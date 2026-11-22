#!/usr/bin/env node
/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

// Copies the chat wallpapers, live shaders and shared test fixtures from the apps, and bakes the gallery thumbnails.
// --android-extra adds the artworks another gua-android checkout has and the first one lacks, writing the merged
// manifest as the apps' own merge does.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WALLPAPERS = path.join(ROOT, "res/img/gua/wallpapers");
const THUMBNAILS = path.join(WALLPAPERS, "thumbnails");
const SHADERS = path.join(ROOT, "src/gua/chatTheme/live/shaders");
const FIXTURES = path.join(ROOT, "test/unit-tests/gua/chatTheme/fixtures");
const ASSETS_MODULE = path.join(ROOT, "src/gua/chatTheme/model/artworkAssets.ts");

const ANDROID_WALLPAPERS = "libraries/matrixui/src/main/assets/wallpapers";
const ANDROID_FIXTURES = {
    "chat-background-fixtures.json": "libraries/chatbackground/api/src/test/resources",
    "chat-theme-precedence-fixtures.json": "libraries/chatbackground/api/src/test/resources",
    "live-wallpaper-motion-fixtures.json": "libraries/matrixui/src/test/resources",
};
const IOS_FIXTURES = "UnitTests/Resources";

/** Twice the 84 by 182 CSS px gallery tile. Only the pinned cwebp reproduces the committed bytes. */
const THUMBNAIL = { width: 168, height: 364, quality: 75 };
const CWEBP_VERSION = "1.6.0";

function parseArgs(argv) {
    const args = { check: false, extra: [], cwebp: "cwebp" };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--check") args.check = true;
        else if (argv[i] === "--android-extra") args.extra.push(argv[++i]);
        else if (argv[i] === "--android" || argv[i] === "--ios" || argv[i] === "--cwebp")
            args[argv[i].slice(2)] = argv[++i];
        else throw new Error(`Unknown argument ${argv[i]}`);
    }
    return args;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const listFiles = (dir) =>
    fs.existsSync(dir)
        ? fs
              .readdirSync(dir, { withFileTypes: true })
              .filter((entry) => entry.isFile())
              .map((entry) => path.join(dir, entry.name))
        : [];

function commitOf(checkout) {
    try {
        const head = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
        const branch = execFileSync("git", ["-C", checkout, "rev-parse", "--abbrev-ref", "HEAD"], {
            encoding: "utf8",
        }).trim();
        const dirty = execFileSync("git", ["-C", checkout, "status", "--porcelain"], { encoding: "utf8" }).trim();
        return `${branch} ${head}${dirty ? " with uncommitted changes" : ""}`;
    } catch {
        return "not a git checkout";
    }
}

function readManifest(checkout) {
    const dir = path.join(checkout, ANDROID_WALLPAPERS);
    return { dir, manifest: JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) };
}

/** Each extra artwork goes after the one it follows in its own manifest, or first when it leads that list. */
function mergeArtworks(main, extras) {
    const artworks = main.manifest.artworks.map((artwork) => ({ artwork, dir: main.dir }));
    for (const extra of extras) {
        let previous;
        for (const artwork of extra.manifest.artworks) {
            const known = artworks.findIndex((entry) => entry.artwork.id === artwork.id);
            if (known < 0) {
                const at = previous === undefined ? 0 : artworks.findIndex((e) => e.artwork.id === previous) + 1;
                artworks.splice(at, 0, { artwork, dir: extra.dir });
            }
            previous = artwork.id;
        }
    }
    return artworks;
}

function checkCwebp(cwebp) {
    const version = execFileSync(cwebp, ["-version"], { encoding: "utf8" }).split("\n")[0].trim();
    if (version !== CWEBP_VERSION) throw new Error(`Thumbnails need cwebp ${CWEBP_VERSION}, found ${version}`);
}

function thumbnail(cwebp, still) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gua-thumbnail-"));
    try {
        const out = path.join(dir, "thumbnail.webp");
        const size = [String(THUMBNAIL.width), String(THUMBNAIL.height)];
        execFileSync(cwebp, [
            "-quiet",
            "-q",
            String(THUMBNAIL.quality),
            "-m",
            "6",
            "-resize",
            ...size,
            still,
            "-o",
            out,
        ]);
        return fs.readFileSync(out);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const camel = (id) => id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

/** Writes the module exactly as Prettier formats it, so `prettier --check` passes. */
function assetsModule(ids) {
    const imports = [];
    const stills = [];
    const thumbnails = [];
    for (const id of ids) {
        const name = camel(id);
        for (const look of ["light", "dark"]) {
            const suffix = look === "light" ? "Light" : "Dark";
            imports.push(`import ${name}${suffix} from "../../../../res/img/gua/wallpapers/${id}-${look}.webp";`);
            imports.push(
                `import ${name}${suffix}Thumbnail from "../../../../res/img/gua/wallpapers/thumbnails/${id}-${look}.webp";`,
            );
        }
        stills.push(`    "${id}": { light: ${name}Light, dark: ${name}Dark },`);
        thumbnails.push(`    "${id}": { light: ${name}LightThumbnail, dark: ${name}DarkThumbnail },`);
    }
    return [
        "/*",
        "Copyright 2026 Gua",
        "",
        "SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only",
        "Please see LICENSE files in the repository root for full details.",
        "*/",
        "",
        "// Written by scripts/gua/sync-wallpapers.mjs from the manifest.",
        "",
        ...imports,
        'import { type ArtworkId } from "./artworks";',
        "",
        "/** URLs only: a still is fetched when something draws it, never bundled into JavaScript. */",
        "const STILLS: Record<ArtworkId, { light: string; dark: string }> = {",
        ...stills,
        "};",
        "",
        `/** ${THUMBNAIL.width} by ${THUMBNAIL.height} pixels, for gallery tiles and other small samples. */`,
        "const THUMBNAILS: Record<ArtworkId, { light: string; dark: string }> = {",
        ...thumbnails,
        "};",
        "",
        "export function stillUrl(id: ArtworkId, dark: boolean): string {",
        "    return dark ? STILLS[id].dark : STILLS[id].light;",
        "}",
        "",
        "export function thumbnailUrl(id: ArtworkId, dark: boolean): string {",
        "    return dark ? THUMBNAILS[id].dark : THUMBNAILS[id].light;",
        "}",
        "",
    ].join("\n");
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.android) {
        console.error(
            "usage: sync-wallpapers.mjs --android <gua-android checkout> [--android-extra <checkout>]... " +
                "[--ios <gua-ios checkout>] [--cwebp <path>] [--check]",
        );
        process.exit(2);
    }
    const android = path.resolve(args.android);
    const extras = args.extra.map((checkout) => path.resolve(checkout));
    checkCwebp(args.cwebp);
    const wanted = new Map();
    const problems = [];

    const main = readManifest(android);
    const artworks = mergeArtworks(main, extras.map(readManifest));
    const manifest = { ...main.manifest, artworks: artworks.map((entry) => entry.artwork) };
    wanted.set(path.join(WALLPAPERS, "manifest.json"), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));

    const noise = fs.readFileSync(path.join(main.dir, manifest.noise.file));
    if (sha256(noise) !== manifest.noise.sha256) problems.push(`${manifest.noise.file} does not match its sha256`);
    wanted.set(path.join(WALLPAPERS, manifest.noise.file), noise);

    for (const { artwork, dir } of artworks) {
        for (const name of [artwork.files.light, artwork.files.dark]) {
            const still = path.join(dir, name);
            const bytes = fs.readFileSync(still);
            if (sha256(bytes) !== artwork.sha256[name]) problems.push(`${name} does not match its sha256`);
            wanted.set(path.join(WALLPAPERS, name), bytes);
            wanted.set(path.join(THUMBNAILS, name), thumbnail(args.cwebp, still));
        }
    }
    wanted.set(ASSETS_MODULE, Buffer.from(assetsModule(manifest.artworks.map((a) => a.id)), "utf8"));

    // generate.mjs runs its command line only when executed directly, so importing it is safe.
    const generate = await import(pathToFileURL(path.join(android, "tools/wallpapers/shaders/generate.mjs")).href);
    const shaders = generate.loadLabShaders(path.join(android, "tools/wallpapers/lab"));
    for (const [id, frag] of shaders) wanted.set(path.join(SHADERS, `${id}.frag`), Buffer.from(frag, "utf8"));
    const liveIds = new Set(manifest.artworks.filter((a) => a.live).map((a) => a.id));
    for (const id of liveIds) if (!shaders.has(id)) problems.push(`The Lab has no shader for the live artwork ${id}`);

    for (const [name, dir] of Object.entries(ANDROID_FIXTURES)) {
        const bytes = fs.readFileSync(path.join(android, dir, name));
        wanted.set(path.join(FIXTURES, name), bytes);
        if (args.ios) {
            const ios = fs.readFileSync(path.join(path.resolve(args.ios), IOS_FIXTURES, name));
            if (!ios.equals(bytes)) problems.push(`${name} differs between gua-android and gua-ios`);
        }
    }

    const stale = [
        ...listFiles(WALLPAPERS),
        ...listFiles(THUMBNAILS),
        ...listFiles(SHADERS).filter((f) => f.endsWith(".frag")),
    ].filter((f) => !wanted.has(f));
    const changed = [...wanted].filter(([file, bytes]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(bytes));

    if (args.check) {
        for (const [file] of changed) problems.push(`${path.relative(ROOT, file)} is out of date`);
        for (const file of stale) problems.push(`${path.relative(ROOT, file)} is no longer in the apps`);
    } else if (problems.length === 0) {
        for (const [file, bytes] of changed) {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, bytes);
        }
        for (const file of stale) fs.rmSync(file);
        console.log(`Updated ${changed.length} files, removed ${stale.length}.`);
    }

    console.log(`gua-android: ${commitOf(android)}`);
    for (const extra of extras) console.log(`gua-android extra: ${commitOf(extra)}`);
    if (args.ios) console.log(`gua-ios: ${commitOf(path.resolve(args.ios))}`);
    if (problems.length > 0) {
        for (const problem of problems) console.error(problem);
        process.exit(1);
    }
}

await main();
