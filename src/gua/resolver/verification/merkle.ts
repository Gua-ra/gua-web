/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { bytesToHex, concatBytes, hexToBytes, utf8Bytes, type VerifierCrypto } from "./ed25519";
import { instantToEpochMs, list, object, optionalString, ParseError, string, uint31 } from "./json";

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface LogEvent {
    index: number;
    type: string;
    homeserverId: string | null;
    payloadHash: string;
    recordedAtEpochMs: number;
}

/** Served order is leaf order: never re-sort the events. */
export function parseLogEvents(document: unknown): LogEvent[] {
    return list(object(document).events).map((value) => {
        const e = object(value);
        return {
            index: uint31(e.index),
            type: string(e.type),
            homeserverId: optionalString(e.homeserverId),
            payloadHash: string(e.payloadHash),
            recordedAtEpochMs: instantToEpochMs(string(e.recordedAt)),
        };
    });
}

export function parseProof(document: unknown): string[] {
    return list(object(document).proof).map((value) => {
        const hash = string(value);
        if (!SHA256_HEX.test(hash)) throw new ParseError("expected a SHA-256 digest");
        return hash;
    });
}

/** RFC 6962 hashing; every hash is lowercase hex. */
export class MerkleTree {
    public constructor(private readonly crypto: VerifierCrypto) {}

    public static leafData(event: LogEvent): string {
        return `${event.index}|${event.type}|${event.homeserverId ?? ""}|${event.payloadHash}|${event.recordedAtEpochMs}`;
    }

    public async leafHash(data: string): Promise<string> {
        return this.crypto.sha256Hex(concatBytes(LEAF_PREFIX, utf8Bytes(data)));
    }

    private async nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
        return this.crypto.sha256(concatBytes(NODE_PREFIX, left, right));
    }

    public async root(leafHashes: string[]): Promise<string> {
        if (leafHashes.length === 0) return this.crypto.sha256Hex(new Uint8Array(0));
        const nodes = leafHashes.map((h) => {
            const node = hexToBytes(h);
            if (!node) throw new Error("malformed leaf hash");
            return node;
        });
        return bytesToHex(await this.mth(nodes));
    }

    private async mth(nodes: Uint8Array[]): Promise<Uint8Array> {
        if (nodes.length === 1) return nodes[0];
        const k = largestPowerOfTwoLessThan(nodes.length);
        return this.nodeHash(await this.mth(nodes.slice(0, k)), await this.mth(nodes.slice(k)));
    }

    /** RFC 6962 section 2.1.2: newRoot over `second` leaves extends oldRoot over `first` leaves. */
    public async verifyConsistency(
        first: number,
        second: number,
        oldRoot: string,
        newRoot: string,
        proof: string[],
    ): Promise<boolean> {
        if (first === 0) return second >= 0;
        if (first === second) return proof.length === 0 && oldRoot === newRoot;
        if (first > second || proof.length === 0) return false;

        const path = proof.map((p) => hexToBytes(p));
        const old = hexToBytes(oldRoot);
        if (!old || path.some((p) => p === null)) return false;
        const nodes = path as Uint8Array[];

        let idx = 0;
        const seed = (first & (first - 1)) === 0 ? old : nodes[idx++];
        let fr = seed;
        let sr = seed;
        let fn = first - 1;
        let sn = second - 1;
        while ((fn & 1) === 1) {
            fn >>= 1;
            sn >>= 1;
        }
        while (idx < nodes.length) {
            // RFC 9162 section 2.1.4.2: hashes left over once sn reaches 0 fail the proof.
            if (sn === 0) return false;
            const node = nodes[idx++];
            if ((fn & 1) === 1 || fn === sn) {
                fr = await this.nodeHash(node, fr);
                sr = await this.nodeHash(node, sr);
                while ((fn & 1) === 0 && fn !== 0) {
                    fn >>= 1;
                    sn >>= 1;
                }
            } else {
                sr = await this.nodeHash(sr, node);
            }
            fn >>= 1;
            sn >>= 1;
        }
        return bytesToHex(fr) === oldRoot && bytesToHex(sr) === newRoot && sn === 0;
    }
}

function largestPowerOfTwoLessThan(n: number): number {
    let k = 1;
    while (k << 1 < n) k <<= 1;
    return k;
}
