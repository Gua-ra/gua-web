/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/** Content with no keys, which a redaction also leaves, removes the theme. Imports nothing: the main bundle uses it. */
export function isRemovalContent(content: unknown): boolean {
    return (
        typeof content === "object" && content !== null && !Array.isArray(content) && Object.keys(content).length === 0
    );
}
