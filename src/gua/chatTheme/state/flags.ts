/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useSettingValue } from "../../../hooks/useSettings";
import { Layout } from "../../../settings/enums/Layout";

/** IRC rows run edge to edge with no message shape to back, so a wallpaper there would need a veil hiding it. */
export function useLayoutShowsChatThemes(): boolean {
    return useSettingValue("layout") !== Layout.IRC;
}
