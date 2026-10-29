/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type LogCheckpoint } from "./canonical";
import { object, string, uint31 } from "./json";

const KEY_PREFIX = "gua_resolver_log_checkpoint:";

/** The last transparency-log checkpoint this client accepted for one resolver. Both methods throw when storage fails. */
export interface CheckpointStore {
    load(): LogCheckpoint | null;
    save(checkpoint: LogCheckpoint): void;
}

export function localStorageCheckpointStore(resolverBaseUrl: string): CheckpointStore {
    const key = KEY_PREFIX + resolverBaseUrl;
    return {
        load(): LogCheckpoint | null {
            const raw = window.localStorage.getItem(key);
            if (raw === null) return null;
            // A pin that does not read back throws: read as no pin, it would let any checkpoint be pinned over it.
            const pin = object(JSON.parse(raw));
            return { merkleRoot: string(pin.merkleRoot), size: uint31(pin.size) };
        },
        save(checkpoint: LogCheckpoint): void {
            window.localStorage.setItem(key, JSON.stringify(checkpoint));
        },
    };
}

/** Every stored pin with its key, so that clearing localStorage can put them back. */
export function storedCheckpoints(): [string, string][] {
    const pins: [string, string][] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        const value = key?.startsWith(KEY_PREFIX) ? window.localStorage.getItem(key) : null;
        if (key && value !== null) pins.push([key, value]);
    }
    return pins;
}
