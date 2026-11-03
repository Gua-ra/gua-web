/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { JoinRule, Room } from "matrix-js-sdk/src/matrix";

import SdkConfig from "../../../../src/SdkConfig";
import { buildGuestLink, getGuestLink, guestLinkName } from "../../../../src/gua/calls/guestLink";
import { getMockClientWithEventEmitter, mockClientMethodsUser, unmockClientPeg } from "../../../test-utils";

const HOST = "@host:example.org";
const ROOM_ID = "!aB3-dE_fG9hIjK";

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
        expect(buildGuestLink("https://call.example.org", "Stand-up", ROOM_ID, "example.org")).toBe(
            "https://call.example.org/room/#/stand-up?roomId=!aB3-dE_fG9hIjK&viaServers=example.org",
        );
    });

    it("joins through the host's server when the room ID names another server", () => {
        expect(buildGuestLink("https://call.example.org/", "Stand-up", "!old:other.example", "example.org")).toBe(
            "https://call.example.org/room/#/stand-up?roomId=!old%3Aother.example&viaServers=example.org",
        );
    });
});

describe("getGuestLink", () => {
    const roomFor = (userId: string): Room =>
        new Room(ROOM_ID, getMockClientWithEventEmitter(mockClientMethodsUser(userId)), userId);

    beforeEach(() => {
        SdkConfig.put({ gua_call: { hosts: [HOST], guest_url: "https://call.example.org" } });
    });

    afterEach(() => {
        SdkConfig.reset();
        unmockClientPeg();
    });

    it("gives a host the link to an Ask to join room", () => {
        expect(getGuestLink(roomFor(HOST), "Stand-up", JoinRule.Knock)).toBe(
            "https://call.example.org/room/#/stand-up?roomId=!aB3-dE_fG9hIjK&viaServers=example.org",
        );
    });

    it("gives no link for a room that is not Ask to join", () => {
        expect(getGuestLink(roomFor(HOST), "Stand-up", JoinRule.Invite)).toBeNull();
    });

    it("gives no link to other accounts", () => {
        expect(getGuestLink(roomFor("@member:example.org"), "Stand-up", JoinRule.Knock)).toBeNull();
    });

    it("gives no link without a guest page", () => {
        SdkConfig.put({ gua_call: { hosts: [HOST] }, element_call: { guest_spa_url: "https://call.example.org" } });
        expect(getGuestLink(roomFor(HOST), "Stand-up", JoinRule.Knock)).toBeNull();
    });
});
