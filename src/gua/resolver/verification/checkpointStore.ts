/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type LogCheckpoint } from "./canonical";

const KEY_PREFIX = "gua_resolver_log_checkpoint:";

/** The last transparency-log checkpoint this client accepted for one resolver. */
export interface CheckpointStore {
    load(): LogCheckpoint | null;
    save(checkpoint: LogCheckpoint): void;
}

export function localStorageCheckpointStore(resolverBaseUrl: string): CheckpointStore {
    const key = KEY_PREFIX + resolverBaseUrl;
    return {
        load(): LogCheckpoint | null {
            try {
                const raw = window.localStorage.getItem(key);
                if (!raw) return null;
                const parsed: unknown = JSON.parse(raw);
                if (typeof parsed !== "object" || parsed === null) return null;
                const { merkleRoot, size } = parsed as Record<string, unknown>;
                if (typeof merkleRoot !== "string" || typeof size !== "number" || !Number.isInteger(size)) return null;
                return { merkleRoot, size };
            } catch {
                return null;
            }
        },
        save(checkpoint: LogCheckpoint): void {
            try {
                window.localStorage.setItem(key, JSON.stringify(checkpoint));
            } catch {
                // Storage can be absent or full; the pin is a convenience, not state the check depends on.
            }
        },
    };
}
