/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type ComponentProps } from "react";
import { EventType, type IContent, type MatrixClient, type MatrixEvent, MsgType } from "matrix-js-sdk/src/matrix";
import { mkEncryptedMatrixEvent } from "matrix-js-sdk/src/testing";
import { render, screen } from "jest-matrix-react";
import { mocked } from "jest-mock";

// ReplyTile loads first: through an import cycle, MessageEvent would otherwise map m.text to an undefined TextualBody.
import ReplyTile from "../../../../src/components/views/rooms/ReplyTile";
import TextualBody from "../../../../src/components/views/messages/TextualBody";
import MatrixClientContext from "../../../../src/contexts/MatrixClientContext";
import DMRoomMap from "../../../../src/utils/DMRoomMap";
import { GUA_ACTIONS_KEY } from "../../../../src/gua/messages/messageActions";
import {
    getMockClientWithEventEmitter,
    mkEvent,
    mkStubRoom,
    mockClientPushProcessor,
    unmockClientPeg,
} from "../../../test-utils";

const ROOM_ID = "!room:example.org";
const SENDER = "@bot:example.org";
const ACTION_URL = "https://example.org/statement/1";
const LABEL = "Open statement";

const messageContent = (
    msgtype: string = MsgType.Text,
    actions: unknown = [{ type: "open_url", label: LABEL, url: ACTION_URL }],
) => ({
    msgtype,
    body: `Statement ready\n${LABEL}: ${ACTION_URL}`,
    format: "org.matrix.custom.html",
    formatted_body: `<strong>Statement ready</strong><br><a href="${ACTION_URL}">${LABEL}</a>`,
    [GUA_ACTIONS_KEY]: actions,
});

const mkMessage = (content: IContent): MatrixEvent =>
    mkEvent({ type: EventType.RoomMessage, room: ROOM_ID, user: SENDER, content, event: true });

describe("message actions in the timeline", () => {
    let client: MatrixClient;

    beforeEach(() => {
        client = getMockClientWithEventEmitter({
            getRoom: jest.fn(),
            ...mockClientPushProcessor(),
            getAccountData: (): MatrixEvent | undefined => undefined,
            getUserId: () => "@me:example.org",
            getHomeserverUrl: () => "https://example.org/",
            isGuest: () => false,
            mxcUrlToHttp: (s: string) => s,
        });
        mocked(client.getRoom).mockReturnValue(mkStubRoom(ROOM_ID, "Room", client));
        DMRoomMap.makeShared(client);
    });

    afterEach(() => {
        unmockClientPeg();
    });

    const renderBody = (props: ComponentProps<typeof TextualBody>) =>
        render(
            <MatrixClientContext.Provider value={client}>
                <TextualBody {...props} />
            </MatrixClientContext.Provider>,
        );

    it.each([MsgType.Text, MsgType.Notice])(
        "shows the action as a button on %s and hides the fallback link",
        (msgtype) => {
            const { container } = renderBody({ mxEvent: mkMessage(messageContent(msgtype)) });

            const button = screen.getByRole("link", { name: LABEL });
            expect(button).toHaveAttribute("href", ACTION_URL);
            expect(button.closest(".mx_GuaMessageActions")).not.toBeNull();
            expect(container.querySelector(".mx_EventTile_body")).toHaveTextContent("Statement ready");
            expect(container.querySelector(".mx_EventTile_body a")).toBeNull();
        },
    );

    it.each([
        ["a bare link", `<a href="${ACTION_URL}">${LABEL}</a>`, {}],
        ["a link in a paragraph", `<p><a href="${ACTION_URL}">${LABEL}</a></p>`, {}],
        [
            "a reply fallback and a link",
            `<mx-reply><blockquote>Earlier message</blockquote></mx-reply><a href="${ACTION_URL}">${LABEL}</a>`,
            { "m.relates_to": { "m.in_reply_to": { event_id: "$parent:example.org" } } },
        ],
    ])("shows only the button when the body is %s", (_name, formattedBody, relation) => {
        const body = `> <@other:example.org> Earlier message\n\n${LABEL}: ${ACTION_URL}`;
        const { container } = renderBody({
            mxEvent: mkMessage({ ...messageContent(), body, formatted_body: formattedBody, ...relation }),
        });

        expect(screen.getAllByRole("link")).toHaveLength(1);
        expect(screen.getByRole("link", { name: LABEL }).closest(".mx_GuaMessageActions")).not.toBeNull();
        expect(container.querySelector(".mx_EventTile_body")).toBeEmptyDOMElement();
        expect(container).not.toHaveTextContent(ACTION_URL);
    });

    it("shows the actions of the latest edit", () => {
        const original = mkMessage({ msgtype: MsgType.Text, body: "Statement ready" });
        original.makeReplaced(
            mkMessage({
                "msgtype": MsgType.Text,
                "body": "* Statement ready",
                "m.new_content": messageContent(),
                "m.relates_to": { rel_type: "m.replace", event_id: original.getId()! },
            }),
        );
        const { container } = renderBody({ mxEvent: original });

        expect(screen.getByRole("link", { name: LABEL })).toHaveAttribute("href", ACTION_URL);
        expect(container.querySelector(".mx_EventTile_body")).toHaveTextContent("Statement ready");
        expect(container.querySelector(".mx_EventTile_body a")).toBeNull();
    });

    it("ignores actions nested in an edit's new content", () => {
        const original = mkMessage({ msgtype: MsgType.Text, body: "Statement ready" });
        original.makeReplaced(
            mkMessage({
                "msgtype": MsgType.Text,
                "body": "* Statement ready",
                "m.new_content": {
                    ...messageContent(MsgType.Text, []),
                    "formatted_body": "<strong>Statement ready</strong>",
                    "m.new_content": messageContent(),
                    "m.relates_to": { rel_type: "m.replace", event_id: original.getId()! },
                },
                "m.relates_to": { rel_type: "m.replace", event_id: original.getId()! },
            }),
        );
        const { container } = renderBody({ mxEvent: original });

        expect(container.querySelector(".mx_GuaMessageActions")).toBeNull();
        expect(screen.queryAllByRole("link")).toEqual([]);
    });

    it("shows actions from decrypted content", async () => {
        const mxEvent = await mkEncryptedMatrixEvent({
            roomId: ROOM_ID,
            sender: SENDER,
            plainType: EventType.RoomMessage,
            plainContent: messageContent(),
        });
        const { container } = renderBody({ mxEvent });

        expect(screen.getByRole("link", { name: LABEL })).toHaveAttribute("href", ACTION_URL);
        expect(container.querySelector(".mx_EventTile_body a")).toBeNull();
    });

    it.each(["forExport", "inhibitInteraction"])("keeps the link and renders no button with %s", (prop) => {
        const { container } = renderBody({ mxEvent: mkMessage(messageContent()), [prop]: true });

        expect(container.querySelector(".mx_GuaMessageActions")).toBeNull();
        expect(container.querySelector(`.mx_EventTile_body a[href="${ACTION_URL}"]`)).toHaveTextContent(LABEL);
    });

    it("renders a message with invalid actions exactly like one without the key", () => {
        const { [GUA_ACTIONS_KEY]: _ignored, ...withoutKey } = messageContent();
        const plain = renderBody({ mxEvent: mkMessage(withoutKey) }).container.innerHTML;
        const invalid = renderBody({
            mxEvent: mkMessage(
                messageContent(MsgType.Text, [{ type: "open_url", label: LABEL, url: "http://example.org/" }]),
            ),
        }).container.innerHTML;

        expect(invalid).toBe(plain);
        expect(plain).toContain(`href="${ACTION_URL}"`);
        expect(plain).not.toContain("mx_GuaMessageActions");
    });

    it("keeps the link and renders no button in a reply preview", () => {
        const { container } = render(
            <MatrixClientContext.Provider value={client}>
                <ReplyTile mxEvent={mkMessage(messageContent())} />
            </MatrixClientContext.Provider>,
        );

        expect(container.querySelector(".mx_ReplyTile")).toHaveTextContent("Statement ready");
        expect(container.querySelector(".mx_GuaMessageActions")).toBeNull();
        expect(container.querySelector(`.mx_EventTile_body a[href="${ACTION_URL}"]`)).toHaveTextContent(LABEL);
    });
});
