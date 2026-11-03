/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { EventType, JoinRule, type MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { act, renderHook } from "jest-matrix-react";

import SdkConfig from "../../../../src/SdkConfig";
import { ElementCallMemberEventType } from "../../../../src/call-types";
import { buildGuestLink, getGuestLink, guestLinkName, useGuestLink } from "../../../../src/gua/calls/guestLink";
import {
    getMockClientWithEventEmitter,
    mkEvent,
    mkMembership,
    mockClientMethodsUser,
    unmockClientPeg,
} from "../../../test-utils";

const HOST = "@host:example.org";
const OTHER_HOST = "@other-host:example.org";
const MEMBER = "@member:example.org";
const ROOM_ID = "!aB3-dE_fG9hIjK";
const GUEST_URL = "https://call.example.org";

describe("guestLinkName", () => {
    it.each([
        ["Reunião com Cliente", "reuniao-com-cliente"],
        ["  Weekly  sync -- Q3 ", "weekly-sync-q3"],
        ["Café?roomId=!x&via=y#z", "cafe-roomid-x-via-y-z"],
        ["ＡＢＣ 123", "abc-123"],
    ])("turns %j into %j", (roomName, name) => {
        expect(guestLinkName(roomName)).toBe(name);
    });

    it.each(["", "---", "会议", "🎉"])("falls back to meeting for %j", (roomName) => {
        expect(guestLinkName(roomName)).toBe("meeting");
    });
});

describe("buildGuestLink", () => {
    it("joins a version 12 room through the host's server", () => {
        expect(buildGuestLink(GUEST_URL, "Stand-up", ROOM_ID, "example.org")).toBe(
            "https://call.example.org/room/#/stand-up?roomId=!aB3-dE_fG9hIjK&viaServers=example.org",
        );
    });

    it("joins through the host's server when the room ID names another server", () => {
        expect(buildGuestLink(`${GUEST_URL}/`, "Stand-up", "!old:other.example", "example.org")).toBe(
            "https://call.example.org/room/#/stand-up?roomId=!old%3Aother.example&viaServers=example.org",
        );
    });
});

describe("getGuestLink", () => {
    let room: Room;

    const stateEvent = (type: EventType, content: object, sender = HOST): MatrixEvent =>
        mkEvent({ event: true, type, room: ROOM_ID, user: sender, skey: "", content });

    const join = (userId: string, name?: string): MatrixEvent =>
        mkMembership({ event: true, room: ROOM_ID, user: userId, mship: KnownMembership.Join, name });

    function setUp({ userId = HOST, creator = HOST, named = true, powerLevels = true } = {}): void {
        const client = getMockClientWithEventEmitter(mockClientMethodsUser(userId));
        room = new Room(ROOM_ID, client, userId);
        room.currentState.setStateEvents([
            stateEvent(EventType.RoomCreate, { room_version: "12" }, creator),
            stateEvent(EventType.RoomJoinRules, { join_rule: JoinRule.Knock }, creator),
            ...(powerLevels
                ? [
                      stateEvent(
                          EventType.RoomPowerLevels,
                          { users_default: 0, state_default: 50, events: { [ElementCallMemberEventType.name]: 0 } },
                          creator,
                      ),
                  ]
                : []),
            ...(named ? [stateEvent(EventType.RoomName, { name: "Stand-up" }, creator)] : []),
            join(creator),
            join(userId),
        ]);
        room.updateMyMembership(KnownMembership.Join);
    }

    const setState = (type: EventType, content: object): void =>
        room.currentState.setStateEvents([stateEvent(type, content)]);

    beforeEach(() => {
        SdkConfig.put({ gua_call: { hosts: [HOST, OTHER_HOST], guest_url: GUEST_URL } });
        setUp();
    });

    afterEach(() => {
        SdkConfig.reset();
        unmockClientPeg();
    });

    it("gives a host the link to an Ask to join room a host created", () => {
        expect(getGuestLink(room)).toBe(
            "https://call.example.org/room/#/stand-up?roomId=!aB3-dE_fG9hIjK&viaServers=example.org",
        );
    });

    it("names an unnamed room's link meeting, not after its members", () => {
        setUp({ named: false });
        room.currentState.setStateEvents([join(MEMBER, "Ana Souza")]);
        room.recalculate();

        expect(room.name).toContain("Ana Souza");
        expect(getGuestLink(room)).toBe(
            "https://call.example.org/room/#/meeting?roomId=!aB3-dE_fG9hIjK&viaServers=example.org",
        );
    });

    it("gives no link for a room that is not Ask to join", () => {
        setState(EventType.RoomJoinRules, { join_rule: JoinRule.Invite });
        expect(getGuestLink(room)).toBeNull();
    });

    it("gives no link to other accounts", () => {
        setUp({ userId: MEMBER });
        expect(getGuestLink(room)).toBeNull();
    });

    it("gives no link without a guest page", () => {
        SdkConfig.put({ gua_call: { hosts: [HOST] }, element_call: { guest_spa_url: GUEST_URL } });
        expect(getGuestLink(room)).toBeNull();
    });

    it("gives no link for a room someone else created", () => {
        setUp({ creator: MEMBER });
        expect(getGuestLink(room)).toBeNull();
    });

    it("gives no link to a host who cannot invite", () => {
        setUp({ creator: OTHER_HOST });
        setState(EventType.RoomPowerLevels, { invite: 50, events: { [ElementCallMemberEventType.name]: 0 } });
        expect(getGuestLink(room)).toBeNull();
    });

    it("gives no link when joining the call needs more than users_default", () => {
        setState(EventType.RoomPowerLevels, { users_default: 0, events: { [ElementCallMemberEventType.name]: 50 } });
        expect(getGuestLink(room)).toBeNull();
    });

    it("falls back to state_default for the call membership level", () => {
        setState(EventType.RoomPowerLevels, { users_default: 0 });
        expect(getGuestLink(room)).toBeNull();

        setState(EventType.RoomPowerLevels, { users_default: 0, state_default: 0 });
        expect(getGuestLink(room)).not.toBeNull();
    });

    it("gives the link when users_default reaches the call membership level", () => {
        setState(EventType.RoomPowerLevels, { users_default: 10, events: { [ElementCallMemberEventType.name]: 10 } });
        expect(getGuestLink(room)).not.toBeNull();
    });

    it("gives the link in a room without power levels", () => {
        setUp({ powerLevels: false });
        expect(getGuestLink(room)).not.toBeNull();
    });

    it("updates when the room state changes", () => {
        setState(EventType.RoomJoinRules, { join_rule: JoinRule.Invite });
        const { result } = renderHook(() => useGuestLink(room));
        expect(result.current).toBeNull();

        act(() => setState(EventType.RoomJoinRules, { join_rule: JoinRule.Knock }));
        expect(result.current).toBe(
            "https://call.example.org/room/#/stand-up?roomId=!aB3-dE_fG9hIjK&viaServers=example.org",
        );
    });
});
