/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/** X.509 SubjectPublicKeyInfo prefix for an Ed25519 key: the 32 raw key bytes follow it. */
export const ED25519_SPKI_PREFIX_HEX = "302a300506032b6570032100";
export const ED25519_SPKI_LENGTH = 44;
export const ED25519_SIGNATURE_LENGTH = 64;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class CryptoUnsupportedError extends Error {
    public constructor() {
        super("WebCrypto Ed25519 is not available");
        this.name = "CryptoUnsupportedError";
    }
}

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

/** Standard padded base64 only; anything else yields null rather than a best-effort decode. */
export function decodeBase64(text: string): Uint8Array | null {
    if (text.length % 4 !== 0 || !BASE64_PATTERN.test(text)) return null;
    const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
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

/** The SPKI bytes of a base64 Ed25519 public key, or null for any other length or prefix. */
export function decodeEd25519Spki(publicKeyB64: string): Uint8Array | null {
    const der = decodeBase64(publicKeyB64);
    if (!der || der.length !== ED25519_SPKI_LENGTH) return null;
    if (bytesToHex(der.subarray(0, 12)) !== ED25519_SPKI_PREFIX_HEX) return null;
    return der;
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

export function webCrypto(): SubtleCrypto | undefined {
    return globalThis.crypto?.subtle;
}

/** Ed25519 and SHA-256 through WebCrypto; absent support surfaces as CryptoUnsupportedError. */
export class VerifierCrypto {
    public constructor(private readonly subtle: SubtleCrypto | undefined = webCrypto()) {}

    public async sha256(data: Uint8Array): Promise<Uint8Array> {
        if (!this.subtle) throw new CryptoUnsupportedError();
        return new Uint8Array(await this.subtle.digest("SHA-256", data));
    }

    public async sha256Hex(data: Uint8Array): Promise<string> {
        return bytesToHex(await this.sha256(data));
    }

    /** Import a base64 SPKI key; null when the encoding is not an Ed25519 SPKI. */
    public async importPublicKey(publicKeyB64: string): Promise<CryptoKey | null> {
        const der = decodeEd25519Spki(publicKeyB64);
        if (!der) return null;
        if (!this.subtle) throw new CryptoUnsupportedError();
        try {
            return await this.subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"]);
        } catch {
            throw new CryptoUnsupportedError();
        }
    }

    /** False on a malformed signature, never an exception. */
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

export interface SignatureVotes {
    /** Distinct trusted key ids whose signature verifies. */
    valid: number;
    /** Signatures that name a trusted key id at all. */
    known: number;
}

/** Configured trust roots. Counting is one vote per key id, as the resolver's own verifiers count. */
export class TrustedKeySet {
    private constructor(
        private readonly crypto: VerifierCrypto,
        private readonly keys: Map<string, CryptoKey>,
    ) {}

    /** A key that is not an Ed25519 SPKI is dropped; the caller decides what an empty set means. */
    public static async load(crypto: VerifierCrypto, keys: TrustedKey[]): Promise<TrustedKeySet> {
        const imported = new Map<string, CryptoKey>();
        for (const k of keys) {
            if (!k.id || imported.has(k.id)) continue;
            const key = await crypto.importPublicKey(k.publicKey);
            if (key) imported.set(k.id, key);
        }
        return new TrustedKeySet(crypto, imported);
    }

    public get size(): number {
        return this.keys.size;
    }

    public async countVotes(
        message: Uint8Array,
        signatures: { keyId: string; signatureB64: string }[],
    ): Promise<SignatureVotes> {
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
