/*
Copyright 2024 New Vector Ltd.
Copyright 2023 Nordeck IT + Consulting GmbH

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { act, fireEvent, render, screen, within } from "jest-matrix-react";
import {
    EventTimeline,
    EventType,
    MatrixError,
    MatrixEvent,
    Room,
    RoomMember,
    RoomStateEvent,
} from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import React from "react";

import ErrorDialog from "../../../../../../../src/components/views/dialogs/ErrorDialog";
import { PeopleRoomSettingsTab } from "../../../../../../../src/components/views/settings/tabs/room/PeopleRoomSettingsTab";
import MatrixClientContext from "../../../../../../../src/contexts/MatrixClientContext";
import Modal from "../../../../../../../src/Modal";
import { flushPromises, getMockClientWithEventEmitter, unmockClientPeg } from "../../../../../../test-utils";
import SdkConfig from "../../../../../../../src/SdkConfig";
import { COLLEAGUE, GUEST, ROOM_ID, setUpGuestCallRoom } from "../../../../../gua/calls/guestCallRoom";

describe("PeopleRoomSettingsTab", () => {
    const client = getMockClientWithEventEmitter({
        getUserId: jest.fn(),
        invite: jest.fn(),
        kick: jest.fn(),
        mxcUrlToHttp: (mxcUrl: string) => mxcUrl,
    });
    const roomId = "#ask-to-join:example.org";
    const userId = "@alice:example.org";
    const member = new RoomMember(roomId, userId);
    const room = new Room(roomId, client, userId);
    const state = room.getLiveTimeline().getState(EventTimeline.FORWARDS)!;

    const getButton = (name: "Approve" | "Deny" | "See less" | "See more") => screen.getByRole("button", { name });
    const getComponent = (room: Room) =>
        render(
            <MatrixClientContext.Provider value={client}>
                <PeopleRoomSettingsTab room={room} />
            </MatrixClientContext.Provider>,
        );
    const getGroup = () => screen.getByRole("group", { name: "Asking to join" });
    const getParagraph = () => document.querySelector("p");

    it("renders a heading", () => {
        getComponent(room);
        expect(screen.getByRole("heading")).toHaveTextContent("People");
    });

    it('renders a group "asking to join"', () => {
        getComponent(room);
        expect(getGroup()).toBeInTheDocument();
    });

    describe("without requests to join", () => {
        it('renders a paragraph "no requests"', () => {
            getComponent(room);
            expect(getParagraph()).toHaveTextContent("No requests");
        });
    });

    describe("with requests to join", () => {
        const error = new MatrixError();
        const knockUserId = "@albert.einstein:example.org";
        const knockMember = new RoomMember(roomId, knockUserId);
        const reason =
            "There are only two ways to live your life. One is as though nothing is a miracle. The other is as though everything is a miracle.";

        beforeEach(() => {
            jest.spyOn(Modal, "createDialog");
            jest.spyOn(room, "canInvite").mockReturnValue(true);
            jest.spyOn(room, "getMember").mockReturnValue(member);
            jest.spyOn(room, "getMembersWithMembership").mockReturnValue([knockMember]);
            jest.spyOn(state, "hasSufficientPowerLevelFor").mockReturnValue(true);

            knockMember.setMembershipEvent(
                new MatrixEvent({
                    content: {
                        avatar_url: "mxc://example.org/albert-einstein.png",
                        displayname: "Albert Einstein",
                        membership: KnownMembership.Knock,
                        reason,
                    },
                    origin_server_ts: -464140800000,
                    type: EventType.RoomMember,
                }),
            );
        });

        it("renders requests fully", () => {
            getComponent(room);
            expect(getGroup()).toMatchSnapshot();
        });

        it("renders requests reduced", () => {
            knockMember.setMembershipEvent(
                new MatrixEvent({
                    content: {
                        displayname: "albert.einstein",
                        membership: KnownMembership.Knock,
                    },
                    type: EventType.RoomMember,
                }),
            );
            getComponent(room);
            expect(getGroup()).toMatchSnapshot();
        });

        it("allows to expand a reason", () => {
            getComponent(room);
            fireEvent.click(getButton("See more"));
            expect(getGroup().querySelector("p")).toHaveTextContent(reason);
        });

        it("allows to collapse a reason", () => {
            getComponent(room);
            fireEvent.click(getButton("See more"));
            fireEvent.click(getButton("See less"));
            expect(getParagraph()).toHaveTextContent(`${reason.substring(0, 120)}…`);
        });

        it("does not truncate a reason unnecessarily", () => {
            const reason = "I have no special talents. I am only passionately curious.";
            knockMember.setMembershipEvent(
                new MatrixEvent({
                    content: {
                        displayname: "albert.einstein",
                        membership: KnownMembership.Knock,
                        reason,
                    },
                    type: EventType.RoomMember,
                }),
            );
            getComponent(room);
            expect(getParagraph()).toHaveTextContent(reason);
        });

        it("disables the deny button if the power level is insufficient", () => {
            jest.spyOn(state, "hasSufficientPowerLevelFor").mockReturnValue(false);
            getComponent(room);
            expect(getButton("Deny")).toHaveAttribute("disabled");
        });

        it("calls kick on deny", () => {
            jest.spyOn(client, "kick").mockResolvedValue({});
            getComponent(room);
            fireEvent.click(getButton("Deny"));
            expect(client.kick).toHaveBeenCalledWith(roomId, knockUserId);
        });

        it("fails to deny a request", async () => {
            jest.spyOn(client, "kick").mockRejectedValue(error);
            getComponent(room);
            fireEvent.click(getButton("Deny"));
            await act(() => flushPromises());
            expect(Modal.createDialog).toHaveBeenCalledWith(ErrorDialog, {
                title: error.name,
                description: error.message,
            });
        });

        it("succeeds to deny a request", () => {
            jest.spyOn(room, "getMembersWithMembership").mockReturnValue([]);
            getComponent(room);
            act(() => {
                room.emit(RoomStateEvent.Update, state);
            });
            expect(getParagraph()).toHaveTextContent("No requests");
        });

        it("disables the approve button if the power level is insufficient", () => {
            jest.spyOn(room, "canInvite").mockReturnValue(false);
            getComponent(room);
            expect(getButton("Approve")).toHaveAttribute("disabled");
        });

        it("calls invite on approve", () => {
            jest.spyOn(client, "invite").mockResolvedValue({});
            getComponent(room);
            fireEvent.click(getButton("Approve"));
            expect(client.invite).toHaveBeenCalledWith(roomId, knockUserId);
        });

        it("fails to approve a request", async () => {
            jest.spyOn(client, "invite").mockRejectedValue(error);
            getComponent(room);
            fireEvent.click(getButton("Approve"));
            await act(() => flushPromises());
            expect(Modal.createDialog).toHaveBeenCalledWith(ErrorDialog, {
                title: error.name,
                description: error.message,
            });
        });

        it("succeeds to approve a request", () => {
            jest.spyOn(room, "getMembersWithMembership").mockReturnValue([]);
            getComponent(room);
            act(() => {
                room.emit(RoomStateEvent.Update, state);
            });
            expect(getParagraph()).toHaveTextContent("No requests");
        });
    });
});

describe("PeopleRoomSettingsTab in a room with a guest link", () => {
    const hint = "Join the call to let them in.";
    const getRow = (userId: string) => within(screen.getByText(userId).closest(".mx_PeopleRoomSettingsTab_knock")!);

    afterEach(() => {
        SdkConfig.reset();
        unmockClientPeg();
    });

    it("lets a guest in once the host is in the call", () => {
        const { client, room, hostJoinsCall } = setUpGuestCallRoom();
        render(<PeopleRoomSettingsTab room={room} />);

        expect(getRow(GUEST).getByRole("button", { name: "Approve" })).toHaveAttribute("disabled");
        expect(getRow(GUEST).getByRole("button", { name: "Deny" })).not.toHaveAttribute("disabled");
        expect(getRow(GUEST).getByText(hint)).toBeInTheDocument();

        act(() => hostJoinsCall());
        expect(getRow(GUEST).queryByText(hint)).not.toBeInTheDocument();
        fireEvent.click(getRow(GUEST).getByRole("button", { name: "Approve" }));
        expect(client.invite).toHaveBeenCalledWith(ROOM_ID, GUEST);
    });

    it("does not hold back someone from the host's own server", () => {
        const { room } = setUpGuestCallRoom({ knockers: [GUEST, COLLEAGUE] });
        render(<PeopleRoomSettingsTab room={room} />);

        expect(getRow(GUEST).getByRole("button", { name: "Approve" })).toHaveAttribute("disabled");
        expect(getRow(COLLEAGUE).getByRole("button", { name: "Approve" })).not.toHaveAttribute("disabled");
        expect(getRow(COLLEAGUE).queryByText(hint)).not.toBeInTheDocument();
    });

    it("does not hold back guests in a room without a guest link", () => {
        const { room } = setUpGuestCallRoom({ creator: COLLEAGUE });
        render(<PeopleRoomSettingsTab room={room} />);

        expect(getRow(GUEST).getByRole("button", { name: "Approve" })).not.toHaveAttribute("disabled");
        expect(getRow(GUEST).queryByText(hint)).not.toBeInTheDocument();
    });
});
