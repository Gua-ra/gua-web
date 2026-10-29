/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type LogCheckpoint } from "./canonical";

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
            if (!raw) return null;
            try {
                const { merkleRoot, size } = JSON.parse(raw);
                return typeof merkleRoot === "string" && Number.isSafeInteger(size) ? { merkleRoot, size } : null;
            } catch {
                return null;
            }
        },
        save(checkpoint: LogCheckpoint): void {
            window.localStorage.setItem(key, JSON.stringify(checkpoint));
        },
    };
}
