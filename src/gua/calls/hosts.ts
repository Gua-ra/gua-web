/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import SdkConfig from "../../SdkConfig";

export function isCallHost(userId: string | null | undefined): boolean {
    const hosts = SdkConfig.get("gua_call")?.hosts;
    return !!userId && Array.isArray(hosts) && hosts.includes(userId);
}
