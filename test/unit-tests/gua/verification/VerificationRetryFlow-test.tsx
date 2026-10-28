/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import EventEmitter from "events";
import { act, render, screen, waitFor } from "jest-matrix-react";
import { mocked } from "jest-mock";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk/src/matrix";
import {
    type CryptoApi,
    type DeviceVerificationStatus,
    VerificationPhase,
    type VerificationRequest,
} from "matrix-js-sdk/src/crypto-api";

import SetupEncryptionBody from "../../../../src/components/structures/auth/SetupEncryptionBody";
import VerificationRequestDialog from "../../../../src/components/views/dialogs/VerificationRequestDialog";
import Modal from "../../../../src/Modal";
import { Phase, SetupEncryptionStore } from "../../../../src/stores/SetupEncryptionStore";
import VerificationRetryListener, {
    RETRY_REQUEST_EVENT_TYPE,
} from "../../../../src/gua/verification/VerificationRetryListener";
import { resetVerifyWithAnotherDevice } from "../../../../src/gua/verification/verifyWithAnotherDevice";
import { flushPromises, stubClient } from "../../../test-utils";

class MockSetupEncryptionStore extends EventEmitter {
    public phase: Phase = Phase.Intro;
    public verificationRequest: VerificationRequest | null = null;
    public backupInfo = null;
    public keyInfo = null;
    public hasDevicesToVerifyAgainst = true;
    public lostKeys(): boolean {
        return false;
    }
    public start: () => void = jest.fn();
    public stop: () => void = jest.fn();
}

type MockRequest = VerificationRequest & { cancel: jest.Mock; pending: boolean };

describe("verification retry request, end to end", () => {
    let client: MatrixClient;
    let crypto: CryptoApi;
    let listener: VerificationRetryListener;
    let requests: MockRequest[];
    let log: string[];

    function nudge(): void {
        client.emit(ClientEvent.ReceivedToDeviceMessage, {
            message: {
                type: RETRY_REQUEST_EVENT_TYPE,
                sender: client.getSafeUserId(),
                content: { from_device: "PHONE" },
            },
            encryptionInfo: null,
        });
    }

    beforeEach(() => {
        resetVerifyWithAnotherDevice();
        client = stubClient();
        crypto = client.getCrypto()!;
        requests = [];
        log = [];

        mocked(crypto.getDeviceVerificationStatus).mockResolvedValue({
            crossSigningVerified: false,
        } as DeviceVerificationStatus);
        crypto.userHasCrossSigningKeys = jest.fn().mockResolvedValue(true);
        mocked(crypto.getVerificationRequestsToDeviceInProgress).mockImplementation(() =>
            requests.filter((request) => request.pending),
        );
        crypto.requestOwnUserVerification = jest.fn().mockImplementation(() => {
            const name = requests.length + 1;
            const target = log;
            log.push(`request ${name}`);
            const request = {
                initiatedByMe: true,
                pending: true,
                phase: VerificationPhase.Requested,
                cancel: jest.fn(async () => {
                    target.push(`cancel ${name}`);
                    request.pending = false;
                }),
            } as unknown as MockRequest;
            requests.push(request);
            return Promise.resolve(request);
        });
        jest.spyOn(Modal, "createDialog").mockImplementation(((component: unknown) => {
            const name = mocked(Modal.createDialog).mock.calls.length;
            log.push(`open ${component === VerificationRequestDialog ? "verification dialog" : "dialog"} ${name}`);
            return {
                finished: new Promise(() => {}),
                close: jest.fn(() => log.push(`close dialog ${name}`)),
            };
        }) as unknown as typeof Modal.createDialog);
        jest.spyOn(SetupEncryptionStore, "sharedInstance").mockReturnValue(
            new MockSetupEncryptionStore() as unknown as SetupEncryptionStore,
        );

        listener = new VerificationRetryListener();
        listener.start(client);
    });

    afterEach(() => {
        listener.stop();
        jest.restoreAllMocks();
    });

    it("sends a request and opens its dialog, then ignores a second nudge inside 15 s", async () => {
        nudge();
        await flushPromises();

        expect(log).toEqual(["request 1", "open verification dialog 1"]);
        expect(Modal.createDialog).toHaveBeenCalledWith(VerificationRequestDialog, {
            verificationRequestPromise: expect.any(Promise),
            member: client.getUser(client.getSafeUserId()),
        });

        nudge();
        await flushPromises();

        expect(crypto.requestOwnUserVerification).toHaveBeenCalledTimes(1);
    });

    it("replaces the request the user just sent by clicking", async () => {
        const { unmount } = render(<SetupEncryptionBody onFinished={jest.fn()} />);
        act(() => screen.getByRole("button", { name: "Verify with another device" }).click());
        unmount();

        nudge();
        await waitFor(() => expect(log).toContain("open verification dialog 2"));

        expect(log).toEqual([
            "request 1",
            "open verification dialog 1",
            "close dialog 1",
            "cancel 1",
            "request 2",
            "open verification dialog 2",
        ]);
    });

    it("runs the mounted body's verify handler", async () => {
        const onFinished = jest.fn();
        render(<SetupEncryptionBody onFinished={onFinished} />);

        nudge();
        await flushPromises();

        expect(onFinished).toHaveBeenCalledTimes(1);
        expect(log).toEqual(["request 1", "open verification dialog 1"]);
    });
});
