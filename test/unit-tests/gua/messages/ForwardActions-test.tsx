/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { EventType, MatrixEvent, MsgType } from "matrix-js-sdk/src/matrix";
import { act, fireEvent, render } from "jest-matrix-react";

import ForwardDialog from "../../../../src/components/views/dialogs/ForwardDialog";
import DMRoomMap from "../../../../src/utils/DMRoomMap";
import { RoomPermalinkCreator } from "../../../../src/utils/permalinks/Permalinks";
import { GUA_ACTIONS_KEY } from "../../../../src/gua/messages/messageActions";
import { getMockClientWithEventEmitter, mkEvent, mkStubRoom, unmockClientPeg } from "../../../test-utils";

const SOURCE_ROOM = "!source:example.org";
const ACTION_URL = "https://example.org/statement/1";
const LABEL = "Open statement";

describe("forwarding a message with actions", () => {
    afterEach(() => {
        unmockClientPeg();
    });

    it("sends the body with its links and without the actions", () => {
        const client = getMockClientWithEventEmitter({
            getUserId: jest.fn().mockReturnValue("@me:example.org"),
            getSafeUserId: jest.fn().mockReturnValue("@me:example.org"),
            isGuest: jest.fn().mockReturnValue(false),
            getVisibleRooms: jest.fn(),
            getRoom: jest.fn(),
            getAccountData: jest.fn().mockReturnValue(new MatrixEvent({ type: EventType.Direct, content: {} })),
            getPushActionsForEvent: jest.fn(),
            mxcUrlToHttp: jest.fn().mockReturnValue(""),
            getProfileInfo: jest.fn().mockResolvedValue({ displayname: "Me" }),
            decryptEventIfNeeded: jest.fn(),
            sendEvent: jest.fn(),
        });
        const target = mkStubRoom("!target:example.org", "Target", client);
        client.getVisibleRooms.mockReturnValue([target]);
        client.getRoom.mockImplementation((roomId) => (roomId === target.roomId ? target : null));
        DMRoomMap.makeShared(client);

        const body = {
            msgtype: MsgType.Text,
            body: `Statement ready\n${LABEL}: ${ACTION_URL}`,
            format: "org.matrix.custom.html",
            formatted_body: `<strong>Statement ready</strong><br><a href="${ACTION_URL}">${LABEL}</a>`,
        };
        const message = mkEvent({
            type: EventType.RoomMessage,
            room: SOURCE_ROOM,
            user: "@bot:example.org",
            content: { ...body, [GUA_ACTIONS_KEY]: [{ type: "open_url", label: LABEL, url: ACTION_URL }] },
            event: true,
        });

        const { container } = render(
            <ForwardDialog
                matrixClient={client}
                event={message}
                permalinkCreator={new RoomPermalinkCreator(undefined!, SOURCE_ROOM)}
                onFinished={jest.fn()}
            />,
        );

        expect(container.querySelector(".mx_GuaMessageActions")).toBeNull();
        expect(container.querySelector(`.mx_EventTile_body a[href="${ACTION_URL}"]`)).toHaveTextContent(LABEL);

        act(() => {
            fireEvent.click(container.querySelector(".mx_ForwardList_sendButton")!);
        });
        expect(client.sendEvent).toHaveBeenCalledWith(target.roomId, EventType.RoomMessage, body);
        expect(message.getContent()[GUA_ACTIONS_KEY]).toHaveLength(1);
    });
});
