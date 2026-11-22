/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useSettingValue } from "../../../hooks/useSettings";
import { Layout } from "../../../settings/enums/Layout";

/** Themes draw only in the bubble layout, the only one with outgoing bubbles to colour. */
export function useIsBubbleLayout(): boolean {
    return useSettingValue("layout") === Layout.Bubble;
}
