/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import SettingsStore from "../../../../src/settings/SettingsStore";

/** Calls `values` on every read, so a test can change an override after rendering. */
export function overrideSettings(values: () => Record<string, unknown>): void {
    const getValue = SettingsStore.getValue.bind(SettingsStore) as (...args: unknown[]) => unknown;
    jest.spyOn(SettingsStore, "getValue").mockImplementation(((name: string, ...rest: unknown[]) => {
        const overrides = values();
        return name in overrides ? overrides[name] : getValue(name, ...rest);
    }) as typeof SettingsStore.getValue);
}
