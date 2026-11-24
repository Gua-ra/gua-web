/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { EventType, JoinRule, type MatrixClient, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { render, screen } from "jest-matrix-react";
import userEvent from "@testing-library/user-event";
import { type MockedObject } from "jest-mock";

import { RoomKnocksBar } from "../../../../src/components/views/rooms/RoomKnocksBar";
import JoinRuleSettings from "../../../../src/components/views/settings/JoinRuleSettings";
import SdkConfig from "../../../../src/SdkConfig";
import {
    getMockClientWithEventEmitter,
    mkEvent,
    mkMembership,
    mockClientMethodsUser,
    unmockClientPeg,
} from "../../../test-utils";

const HOST = "@host:example.org";
const GUEST = "@guest:guest.example.org";
const ROOM_ID = "!aB3-dE_fG9hIjK";

// Version 12 creators have unlimited power without an entry in m.room.power_levels.
describe("a call host in a version 12 room they created", () => {
    let client: MockedObject<MatrixClient>;
    let room: Room;

    const stateEvent = (type: EventType, content: object) =>
        mkEvent({ event: true, type, room: ROOM_ID, user: HOST, skey: "", content });

    beforeEach(() => {
        SdkConfig.put({ gua_call: { hosts: [HOST] } });
        client = getMockClientWithEventEmitter({
            ...mockClientMethodsUser(HOST),
            invite: jest.fn().mockResolvedValue({}),
            kick: jest.fn().mockResolvedValue({}),
            sendStateEvent: jest.fn().mockResolvedValue({ event_id: "$event" }),
            getRoomDirectoryVisibility: jest.fn().mockResolvedValue({ visibility: "private" }),
        });
        room = new Room(ROOM_ID, client, HOST);
        room.currentState.setStateEvents([
            stateEvent(EventType.RoomCreate, { room_version: "12" }),
            stateEvent(EventType.RoomPowerLevels, { users: {}, invite: 50, kick: 50, state_default: 50 }),
            mkMembership({ event: true, room: ROOM_ID, user: HOST, mship: KnownMembership.Join }),
        ]);
        room.updateMyMembership(KnownMembership.Join);
    });

    afterEach(() => {
        SdkConfig.reset();
        unmockClientPeg();
    });

    it("can admit a knocking guest", async () => {
        room.currentState.setStateEvents([
            stateEvent(EventType.RoomJoinRules, { join_rule: JoinRule.Knock }),
            mkMembership({ event: true, room: ROOM_ID, user: GUEST, mship: KnownMembership.Knock }),
        ]);
        render(<RoomKnocksBar room={room} />);

        await userEvent.click(screen.getByRole("button", { name: "Approve" }));

        expect(client.invite).toHaveBeenCalledWith(ROOM_ID, GUEST);
    });

    it("can make the room Ask to join", async () => {
        room.currentState.setStateEvents([stateEvent(EventType.RoomJoinRules, { join_rule: JoinRule.Invite })]);
        render(<JoinRuleSettings room={room} closeSettingsFn={jest.fn()} onError={jest.fn()} />);

        await userEvent.click(screen.getByText("Ask to join"));

        expect(client.sendStateEvent).toHaveBeenCalledWith(
            ROOM_ID,
            EventType.RoomJoinRules,
            { join_rule: JoinRule.Knock },
            "",
        );
    });
});
