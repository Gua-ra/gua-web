/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { JoinRule, type Room } from "matrix-js-sdk/src/matrix";

import SdkConfig from "../../SdkConfig";
import { isCallHost } from "./hosts";

// Element Call reads its parameters from the first "?" in the fragment, so the name keeps to URL-safe characters.
export function guestLinkName(roomName: string): string {
    const name = roomName
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return name || "meeting";
}

// Guests join through the host's server: version 12 room IDs carry no server name.
export function buildGuestLink(guestUrl: string, roomName: string, roomId: string, serverName: string): string {
    const base = guestUrl.replace(/\/+$/, "");
    const params = `roomId=${encodeURIComponent(roomId)}&viaServers=${encodeURIComponent(serverName)}`;
    return `${base}/room/#/${guestLinkName(roomName)}?${params}`;
}

export function getGuestLink(room: Room, roomName: string, joinRule: JoinRule): string | null {
    const guestUrl = SdkConfig.get("gua_call")?.guest_url;
    if (joinRule !== JoinRule.Knock || !guestUrl || !isCallHost(room.client.getUserId())) return null;
    const serverName = room.client.getDomain();
    return serverName ? buildGuestLink(guestUrl, roomName, room.roomId, serverName) : null;
}
