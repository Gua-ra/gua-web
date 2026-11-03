/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { EventType, type IPowerLevelsContent, JoinRule, type Room } from "matrix-js-sdk/src/matrix";

import SdkConfig from "../../SdkConfig";
import { ElementCallMemberEventType } from "../../call-types";
import { useRoomState } from "../../hooks/useRoomState";
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

// Guests sit at users_default and have to be able to send their call membership.
function guestsCanJoinCall(room: Room): boolean {
    const powerLevels = room.currentState
        .getStateEvents(EventType.RoomPowerLevels, "")
        ?.getContent<IPowerLevelsContent>();
    // Without a power levels event every state event needs level 0.
    if (!powerLevels) return true;

    const level = (value: unknown, fallback: number): number =>
        Number.isSafeInteger(value) ? (value as number) : fallback;
    const required = level(powerLevels.events?.[ElementCallMemberEventType.name], level(powerLevels.state_default, 50));
    return required <= level(powerLevels.users_default, 0);
}

/**
 * The link a call host gives guests, or null where a guest could not get into the call.
 * The call gate only serves rooms whose creator is a host.
 */
export function getGuestLink(room: Room): string | null {
    const guestUrl = SdkConfig.get("gua_call")?.guest_url;
    if (!guestUrl || room.getJoinRule() !== JoinRule.Knock) return null;

    const userId = room.client.getUserId();
    const serverName = room.client.getDomain();
    if (
        !userId ||
        !serverName ||
        !isCallHost(userId) ||
        !isCallHost(room.getCreator()) ||
        !room.canInvite(userId) ||
        !guestsCanJoinCall(room)
    ) {
        return null;
    }

    // The computed name of an unnamed room lists its members.
    const name = room.currentState.getStateEvents(EventType.RoomName, "")?.getContent().name;
    return buildGuestLink(guestUrl, typeof name === "string" ? name : "", room.roomId, serverName);
}

export function useGuestLink(room: Room): string | null {
    return useRoomState(room, () => getGuestLink(room));
}
