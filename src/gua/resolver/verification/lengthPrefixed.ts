/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { concatBytes, utf8Bytes } from "./ed25519";

/** A value with no canonical encoding: the object carrying it is refused, never repaired. */
export class CanonicalEncodingError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "CanonicalEncodingError";
    }
}

function isWellFormed(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            const next = text.charCodeAt(i + 1);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
            i++;
        } else if (c >= 0xdc00 && c <= 0xdfff) {
            return false;
        }
    }
    return true;
}

function strictUtf8(text: string): Uint8Array {
    if (!isWellFormed(text)) throw new CanonicalEncodingError("string is not valid Unicode");
    return utf8Bytes(text);
}

function compareUnsigned(a: Uint8Array, b: Uint8Array): number {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
}

/**
 * The gua-lp.v1 encoding: u32 big-endian lengths, int64 big-endian, a presence byte for optionals, sets sorted
 * by unsigned UTF-8 byte order, no delimiters and no escaping.
 */
export class LengthPrefixedEncoder {
    private readonly parts: Uint8Array[] = [];

    private u32(value: number): void {
        const out = new Uint8Array(4);
        new DataView(out.buffer).setUint32(0, value, false);
        this.parts.push(out);
    }

    private bytes(value: Uint8Array): this {
        this.u32(value.length);
        this.parts.push(value);
        return this;
    }

    public string(value: string | null | undefined): this {
        if (value === null || value === undefined) {
            throw new CanonicalEncodingError("string must not be null; use an optional field");
        }
        return this.bytes(strictUtf8(value));
    }

    public int64(value: bigint | number): this {
        const out = new Uint8Array(8);
        new DataView(out.buffer).setBigInt64(0, BigInt(value), false);
        this.parts.push(out);
        return this;
    }

    public optionalString(value: string | null | undefined): this {
        if (value === null || value === undefined) {
            this.parts.push(new Uint8Array([0]));
            return this;
        }
        this.parts.push(new Uint8Array([1]));
        return this.string(value);
    }

    public enumName(value: string | null | undefined): this {
        if (!value) throw new CanonicalEncodingError("enum must not be null; use an optional field");
        return this.string(value);
    }

    public stringSet(values: string[]): this {
        const encoded = values.map(strictUtf8).sort(compareUnsigned);
        for (let i = 1; i < encoded.length; i++) {
            if (compareUnsigned(encoded[i - 1], encoded[i]) === 0) {
                throw new CanonicalEncodingError("duplicate set element");
            }
        }
        this.u32(encoded.length);
        for (const e of encoded) this.bytes(e);
        return this;
    }

    public toBytes(): Uint8Array {
        return concatBytes(...this.parts);
    }
}
