/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import EventEmitter from "events";
import { EventType, JoinRule, type MatrixClient, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { type CallMembership, type MatrixRTCSession, MatrixRTCSessionEvent } from "matrix-js-sdk/src/matrixrtc";
import { type MockedObject } from "jest-mock";

import SdkConfig from "../../../../src/SdkConfig";
import { ElementCallMemberEventType } from "../../../../src/call-types";
import { getMockClientWithEventEmitter, mkEvent, mkMembership, mockClientMethodsUser } from "../../../test-utils";

export const HOST = "@host:example.org";
export const GUEST = "@guest:guest.example.org";
export const COLLEAGUE = "@colleague:example.org";
export const ROOM_ID = "!aB3-dE_fG9hIjK";

export interface GuestCallRoom {
    client: MockedObject<MatrixClient>;
    room: Room;
    hostJoinsCall(deviceId?: string): void;
}

/** An Ask to join room, signed in as a call host, with people knocking and nobody in the call yet. */
export function setUpGuestCallRoom({ creator = HOST, knockers = [GUEST] } = {}): GuestCallRoom {
    SdkConfig.put({ gua_call: { hosts: [HOST], guest_url: "https://call.example.org" } });

    const session = Object.assign(new EventEmitter(), { memberships: [] as CallMembership[] });
    const client = getMockClientWithEventEmitter({
        ...mockClientMethodsUser(HOST),
        invite: jest.fn().mockResolvedValue({}),
        kick: jest.fn().mockResolvedValue({}),
        matrixRTC: { getRoomSession: jest.fn().mockReturnValue(session as unknown as MatrixRTCSession) },
    });

    const room = new Room(ROOM_ID, client, HOST);
    const stateEvent = (type: EventType, content: object): ReturnType<typeof mkEvent> =>
        mkEvent({ event: true, type, room: ROOM_ID, user: creator, skey: "", content });
    room.currentState.setStateEvents([
        stateEvent(EventType.RoomCreate, { room_version: "12" }),
        stateEvent(EventType.RoomJoinRules, { join_rule: JoinRule.Knock }),
        stateEvent(EventType.RoomPowerLevels, {
            users: creator === HOST ? {} : { [HOST]: 100 },
            users_default: 0,
            events: { [ElementCallMemberEventType.name]: 0 },
        }),
        mkMembership({ event: true, room: ROOM_ID, user: creator, mship: KnownMembership.Join }),
        mkMembership({ event: true, room: ROOM_ID, user: HOST, mship: KnownMembership.Join }),
        ...knockers.map((user) =>
            mkMembership({
                event: true,
                room: ROOM_ID,
                user,
                mship: KnownMembership.Knock,
                name: user.slice(1).split(":")[0],
            }),
        ),
    ]);
    room.updateMyMembership(KnownMembership.Join);

    return {
        client,
        room,
        hostJoinsCall: (deviceId = "PHONE") => {
            session.memberships = [{ sender: HOST, deviceId } as CallMembership];
            session.emit(MatrixRTCSessionEvent.MembershipsChanged, [], session.memberships);
        },
    };
}
