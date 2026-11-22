#!/usr/bin/env node
/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

// Copies the chat wallpapers, live shaders and shared test fixtures from the apps, byte for byte.
// Usage: node scripts/gua/sync-wallpapers.mjs --android <gua-android checkout> [--ios <gua-ios checkout>] [--check]

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WALLPAPERS = path.join(ROOT, "res/img/gua/wallpapers");
const SHADERS = path.join(ROOT, "src/gua/chatTheme/live/shaders");
const FIXTURES = path.join(ROOT, "test/unit-tests/gua/chatTheme/fixtures");

const ANDROID_WALLPAPERS = "libraries/matrixui/src/main/assets/wallpapers";
const ANDROID_FIXTURES = {
    "chat-background-fixtures.json": "libraries/chatbackground/api/src/test/resources",
    "chat-theme-precedence-fixtures.json": "libraries/chatbackground/api/src/test/resources",
    "live-wallpaper-motion-fixtures.json": "libraries/matrixui/src/test/resources",
};
const IOS_FIXTURES = "UnitTests/Resources";

function parseArgs(argv) {
    const args = { check: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--check") args.check = true;
        else if (argv[i] === "--android" || argv[i] === "--ios") args[argv[i].slice(2)] = argv[++i];
        else throw new Error(`Unknown argument ${argv[i]}`);
    }
    return args;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const listDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => path.join(dir, f)) : []);

function commitOf(checkout) {
    try {
        const head = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
        const dirty = execFileSync("git", ["-C", checkout, "status", "--porcelain"], { encoding: "utf8" }).trim();
        return dirty ? `${head} with uncommitted changes` : head;
    } catch {
        return "not a git checkout";
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.android) {
        console.error(
            "usage: sync-wallpapers.mjs --android <gua-android checkout> [--ios <gua-ios checkout>] [--check]",
        );
        process.exit(2);
    }
    const android = path.resolve(args.android);
    const wanted = new Map();
    const problems = [];

    const sourceDir = path.join(android, ANDROID_WALLPAPERS);
    const manifestBytes = fs.readFileSync(path.join(sourceDir, "manifest.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    wanted.set(path.join(WALLPAPERS, "manifest.json"), manifestBytes);

    const noise = fs.readFileSync(path.join(sourceDir, manifest.noise.file));
    if (sha256(noise) !== manifest.noise.sha256) problems.push(`${manifest.noise.file} does not match its sha256`);
    wanted.set(path.join(WALLPAPERS, manifest.noise.file), noise);

    for (const artwork of manifest.artworks) {
        for (const name of [artwork.files.light, artwork.files.dark]) {
            const bytes = fs.readFileSync(path.join(sourceDir, name));
            if (sha256(bytes) !== artwork.sha256[name]) problems.push(`${name} does not match its sha256`);
            wanted.set(path.join(WALLPAPERS, name), bytes);
        }
    }

    // generate.mjs runs its command line only when executed directly, so importing it only loads the Lab.
    const generate = await import(pathToFileURL(path.join(android, "tools/wallpapers/shaders/generate.mjs")).href);
    const shaders = generate.loadLabShaders(path.join(android, "tools/wallpapers/lab"));
    for (const [id, frag] of shaders) wanted.set(path.join(SHADERS, `${id}.frag`), Buffer.from(frag, "utf8"));

    for (const [name, dir] of Object.entries(ANDROID_FIXTURES)) {
        const bytes = fs.readFileSync(path.join(android, dir, name));
        wanted.set(path.join(FIXTURES, name), bytes);
        if (args.ios) {
            const ios = fs.readFileSync(path.join(path.resolve(args.ios), IOS_FIXTURES, name));
            if (!ios.equals(bytes)) problems.push(`${name} differs between gua-android and gua-ios`);
        }
    }

    const stale = [...listDir(WALLPAPERS), ...listDir(SHADERS).filter((f) => f.endsWith(".frag"))].filter(
        (f) => !wanted.has(f),
    );
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
    if (args.ios) console.log(`gua-ios: ${commitOf(path.resolve(args.ios))}`);
    if (problems.length > 0) {
        for (const problem of problems) console.error(problem);
        process.exit(1);
    }
}

await main();
