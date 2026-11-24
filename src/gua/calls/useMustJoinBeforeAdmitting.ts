/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useCallback } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/src/matrixrtc";

import { useTypedEventEmitterState } from "../../hooks/useEventEmitter";
import { useCall, useConnectionState } from "../../hooks/useCall";
import { ConnectionState } from "../../models/Call";
import { getServerName } from "../../utils/permalinks/Permalinks";
import { useGuestLink } from "./guestLink";

/**
 * Whether letting a knocker from another server in has to wait until the host is in the call.
 * A guest's Element Call asks the call gate for a token as soon as the knock is accepted, and the
 * gate refuses guests while no host device is in the call.
 */
export function useMustJoinBeforeAdmitting(room: Room): (userId: string) => boolean {
    const guarded = !!useGuestLink(room);
    const client = room.client;
    const ownUserId = client.getUserId();
    const session = guarded ? client.matrixRTC.getRoomSession(room) : undefined;
    const otherDeviceInCall = useTypedEventEmitterState(
        session,
        MatrixRTCSessionEvent.MembershipsChanged,
        useCallback(
            () => !!session?.memberships.some((m) => m.sender === ownUserId && m.deviceId !== client.getDeviceId()),
            [session, ownUserId, client],
        ),
    );
    const thisDeviceListed = useTypedEventEmitterState(
        session,
        MatrixRTCSessionEvent.MembershipsChanged,
        useCallback(
            () => !!session?.memberships.some((m) => m.sender === ownUserId && m.deviceId === client.getDeviceId()),
            [session, ownUserId, client],
        ),
    );
    // Without delayed events a membership outlives a reload or a closed tab for hours, so this
    // browser's own one counts only while this tab is in the call.
    const connectedHere = useConnectionState(useCall(room.roomId)) === ConnectionState.Connected;
    const hostInCall = otherDeviceInCall || (thisDeviceListed && connectedHere);

    return useCallback(
        (userId: string) => guarded && !hostInCall && getServerName(userId) !== client.getDomain(),
        [guarded, hostInCall, client],
    );
}
