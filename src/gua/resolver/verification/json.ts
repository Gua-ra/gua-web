/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { concatBytes } from "./ed25519";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 64;
const INT32_MIN = -0x80000000;
const INT32_MAX = 0x7fffffff;
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_ARRAY = 0x5b;
const CLOSE_ARRAY = 0x5d;
const OPEN_OBJECT = 0x7b;
const CLOSE_OBJECT = 0x7d;

export class ParseError extends Error {}

export type JsonObject = Record<string, unknown>;

/** Checks size and depth before decoding, so a hostile body exhausts neither memory nor the parser's stack. */
export async function readJsonBody(body: ReadableStream<Uint8Array> | null): Promise<unknown> {
    const bytes = await readAtMost(body, MAX_BODY_BYTES);
    if (nestingExceeds(bytes, MAX_DEPTH)) throw new ParseError("nested too deeply");
    try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
        throw new ParseError("not JSON");
    }
}

async function readAtMost(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
    if (!body) return new Uint8Array(0);
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return concatBytes(...chunks);
        size += value.byteLength;
        if (size > limit) {
            void reader.cancel().catch(() => undefined);
            throw new ParseError("body too large");
        }
        chunks.push(value);
    }
}

/** Must not recurse, or the check itself could overflow the stack. */
function nestingExceeds(bytes: Uint8Array, max: number): boolean {
    let depth = 0;
    let inString = false;
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (inString) {
            if (b === BACKSLASH) i++;
            else if (b === QUOTE) inString = false;
        } else if (b === QUOTE) {
            inString = true;
        } else if (b === OPEN_ARRAY || b === OPEN_OBJECT) {
            if (++depth > max) return true;
        } else if (b === CLOSE_ARRAY || b === CLOSE_OBJECT) {
            depth--;
        }
    }
    return false;
}

export function object(value: unknown): JsonObject {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ParseError("expected an object");
    return value as JsonObject;
}

export function list(value: unknown): unknown[] {
    if (!Array.isArray(value)) throw new ParseError("expected a list");
    return value;
}

export function string(value: unknown): string {
    if (typeof value !== "string") throw new ParseError("expected a string");
    return value;
}

export function optionalString(value: unknown): string | null {
    return value === undefined || value === null ? null : string(value);
}

export function absentOrString(value: unknown): string | null {
    return value === undefined ? null : string(value);
}

export function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") throw new ParseError("expected a boolean");
    return value;
}

export function optionalBoolean(value: unknown): boolean | null {
    return value === undefined || value === null ? null : boolean(value);
}

export function optionalStringList(value: unknown): string[] | null {
    return value === undefined || value === null ? null : list(value).map(string);
}

/** Java longs, limited to the integers a double holds exactly. */
export function int64(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new ParseError("expected an integer");
    return value;
}

export function int32(value: unknown): number {
    const n = int64(value);
    if (n < INT32_MIN || n > INT32_MAX) throw new ParseError("expected a 32-bit integer");
    return n;
}

/** The consistency check shifts log sizes as int32 and would never end past 2^31. */
export function uint31(value: unknown): number {
    const n = int64(value);
    if (n < 0 || n > INT32_MAX) throw new ParseError("expected a log size");
    return n;
}

export interface ParsedInstant {
    epochMs: number;
    exactMillis: boolean;
}

export function parseInstant(iso: string): ParsedInstant | null {
    const m = INSTANT_PATTERN.exec(iso);
    if (!m) return null;
    const [year, month, day, hour, minute, second] = m.slice(1, 7).map((s) => parseInt(s, 10));
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    if (hour > 23 || minute > 59 || second > 59) return null;
    const fraction = m[7] ?? "";
    const millis = parseInt((fraction + "000").substring(0, 3), 10);
    const exactMillis = !/[1-9]/.test(fraction.substring(3));
    const days = daysFromCivil(year, month, day);
    return { epochMs: (days * 86400 + hour * 3600 + minute * 60 + second) * 1000 + millis, exactMillis };
}

export function instantToEpochMs(iso: string): number {
    const parsed = parseInstant(iso);
    if (!parsed) throw new ParseError("expected an instant");
    return parsed.epochMs;
}

export function instant(value: unknown): string {
    const text = string(value);
    instantToEpochMs(text);
    return text;
}

export function optionalInstant(value: unknown): string | null {
    return value === undefined || value === null ? null : instant(value);
}

function daysInMonth(year: number, month: number): number {
    if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysFromCivil(year: number, month: number, day: number): number {
    const y = month <= 2 ? year - 1 : year;
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
}
