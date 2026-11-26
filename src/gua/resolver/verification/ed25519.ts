/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { Reason } from "./report";

export const ED25519_SPKI_PREFIX_HEX = "302a300506032b6570032100";
const ED25519_SPKI_LENGTH = 44;
const ED25519_SIGNATURE_LENGTH = 64;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const P = 2n ** 255n - 19n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
/** The y-coordinates of the eight points of order 1, 2, 4 and 8. */
const SMALL_ORDER_Y = new Set([
    1n,
    P - 1n,
    0n,
    0x05fc536d880238b13933c6d305acdfd5f098eff289f4c345b027b2c28f95e826n,
    0x7a03ac9277fdc74ec6cc392cfa53202a0f67100d760b3cba4fd84d3d706a17c7n,
]);

export function utf8Bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

export function bytesToHex(bytes: Uint8Array): string {
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
}

export function hexToBytes(hex: string): Uint8Array | null {
    if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    return out;
}

/** Strict standard padded base64; anything else yields null. */
export function decodeBase64(text: string): Uint8Array | null {
    if (typeof text !== "string" || text.length % 4 !== 0 || !BASE64_PATTERN.test(text)) return null;
    const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
    // Unused bits must be zero so that each byte string has exactly one spelling.
    if (padding === 2 && BASE64_ALPHABET.indexOf(text[text.length - 3]) & 0x0f) return null;
    if (padding === 1 && BASE64_ALPHABET.indexOf(text[text.length - 2]) & 0x03) return null;
    const out = new Uint8Array((text.length / 4) * 3 - padding);
    let o = 0;
    for (let i = 0; i < text.length; i += 4) {
        const n =
            (BASE64_ALPHABET.indexOf(text[i]) << 18) |
            (BASE64_ALPHABET.indexOf(text[i + 1]) << 12) |
            ((text[i + 2] === "=" ? 0 : BASE64_ALPHABET.indexOf(text[i + 2])) << 6) |
            (text[i + 3] === "=" ? 0 : BASE64_ALPHABET.indexOf(text[i + 3]));
        out[o++] = (n >> 16) & 0xff;
        if (o < out.length) out[o++] = (n >> 8) & 0xff;
        if (o < out.length) out[o++] = n & 0xff;
    }
    return out;
}

export function decodeEd25519Spki(publicKeyB64: string): Uint8Array | null {
    const der = decodeBase64(publicKeyB64);
    if (!der || der.length !== ED25519_SPKI_LENGTH) return null;
    if (bytesToHex(der.subarray(0, 12)) !== ED25519_SPKI_PREFIX_HEX) return null;
    return isUsablePoint(der.subarray(12)) ? der : null;
}

/**
 * A canonical encoding (RFC 8032 section 5.1.3) of a curve point outside the small-order subgroup. WebCrypto
 * checks none of this, and signatures under a small-order key can be forged.
 */
function isUsablePoint(encoded: Uint8Array): boolean {
    let y = 0n;
    for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? encoded[i] & 0x7f : encoded[i]);
    if (y >= P || SMALL_ORDER_Y.has(y)) return false;
    const y2 = (y * y) % P;
    const x2 = (((y2 - 1n + P) % P) * modPow((D * y2 + 1n) % P, P - 2n)) % P;
    return x2 === 0n || modPow(x2, (P - 1n) / 2n) === 1n;
}

function modPow(base: bigint, exponent: bigint): bigint {
    let result = 1n;
    let b = base % P;
    for (let e = exponent; e > 0n; e >>= 1n) {
        if (e & 1n) result = (result * b) % P;
        b = (b * b) % P;
    }
    return result;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

export class VerifierCrypto {
    public constructor(private readonly subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null) {}

    public async sha256(data: Uint8Array): Promise<Uint8Array> {
        if (!this.subtle) throw new Error("SubtleCrypto is not available");
        return new Uint8Array(await this.subtle.digest("SHA-256", data));
    }

    public async sha256Hex(data: Uint8Array): Promise<string> {
        return bytesToHex(await this.sha256(data));
    }

    public async importPublicKey(publicKeyB64: string): Promise<CryptoKey | null> {
        const der = decodeEd25519Spki(publicKeyB64);
        return der ? this.importSpki(der) : null;
    }

    public async importSpki(der: Uint8Array): Promise<CryptoKey | null> {
        if (!this.subtle) return null;
        try {
            return await this.subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"]);
        } catch {
            return null;
        }
    }

    public async verify(key: CryptoKey, message: Uint8Array, signatureB64: string): Promise<boolean> {
        const signature = decodeBase64(signatureB64);
        if (!signature || signature.length !== ED25519_SIGNATURE_LENGTH || !this.subtle) return false;
        try {
            return await this.subtle.verify({ name: "Ed25519" }, key, signature, message);
        } catch {
            return false;
        }
    }
}

export interface TrustedKey {
    id: string;
    publicKey: string;
}

export interface Signature {
    keyId: string;
    signatureB64: string;
}

export interface SignatureVotes {
    valid: number;
    /** Signatures that name a trusted key id at all. */
    known: number;
}

/** One vote per key id, as the resolver's own verifiers count. */
export class TrustedKeySet {
    private constructor(
        private readonly crypto: VerifierCrypto,
        private readonly keys: Map<string, CryptoKey>,
        public readonly refused: number,
    ) {}

    /** A platform without Ed25519 shows up as well-formed keys counted in `refused`. */
    public static async load(crypto: VerifierCrypto, keys: TrustedKey[]): Promise<TrustedKeySet> {
        const imported = new Map<string, CryptoKey>();
        let refused = 0;
        for (const k of keys) {
            const der = decodeEd25519Spki(k.publicKey);
            if (!k.id || imported.has(k.id) || !der) continue;
            const key = await crypto.importSpki(der);
            if (key) imported.set(k.id, key);
            else refused++;
        }
        return new TrustedKeySet(crypto, imported, refused);
    }

    public get size(): number {
        return this.keys.size;
    }

    public async countVotes(message: Uint8Array, signatures: Signature[]): Promise<SignatureVotes> {
        const counted = new Set<string>();
        let known = 0;
        for (const s of signatures) {
            const key = this.keys.get(s.keyId);
            if (!key) continue;
            known++;
            if (counted.has(s.keyId)) continue;
            if (await this.crypto.verify(key, message, s.signatureB64)) counted.add(s.keyId);
        }
        return { valid: counted.size, known };
    }
}

export function signatureFailure(votes: SignatureVotes, threshold: number): Reason | null {
    if (votes.valid >= Math.max(1, threshold)) return null;
    if (votes.known === 0) return Reason.UnknownKeyId;
    return votes.valid === 0 ? Reason.BadSignature : Reason.ThresholdNotMet;
}
