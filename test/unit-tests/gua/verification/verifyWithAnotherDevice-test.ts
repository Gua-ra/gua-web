/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { mocked } from "jest-mock";
import { waitFor } from "jest-matrix-react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { type CryptoApi, VerificationPhase, type VerificationRequest } from "matrix-js-sdk/src/crypto-api";

import Modal from "../../../../src/Modal";
import VerificationRequestDialog from "../../../../src/components/views/dialogs/VerificationRequestDialog";
import {
    lastVerificationRestartAt,
    registerVerifyButtonHandler,
    resetVerifyWithAnotherDevice,
    retryVerifyWithAnotherDevice,
    verifyWithAnotherDevice,
} from "../../../../src/gua/verification/verifyWithAnotherDevice";
import { flushPromises, stubClient } from "../../../test-utils";

type MockRequest = VerificationRequest & { cancel: jest.Mock; pending: boolean; phase: VerificationPhase };

describe("verifyWithAnotherDevice", () => {
    let client: MatrixClient;
    let crypto: CryptoApi;
    let log: string[];
    let requests: MockRequest[];
    let dialogs: { close: jest.Mock }[];

    function makeRequest(name: string, initiatedByMe = true): MockRequest {
        const request = {
            initiatedByMe,
            pending: true,
            phase: VerificationPhase.Requested,
            cancel: jest.fn(),
        } as unknown as MockRequest;
        // Bound now, so a cancel that settles after its test cannot write into the next test's log.
        const target = log;
        request.cancel.mockImplementation(async () => {
            target.push(`cancel ${name}`);
            // The cancel goes out over HTTP; the next request must wait for it.
            await new Promise((resolve) => setTimeout(resolve, 0));
            target.push(`cancel ${name} sent`);
            request.pending = false;
            request.phase = VerificationPhase.Cancelled;
        });
        return request;
    }

    beforeEach(() => {
        resetVerifyWithAnotherDevice();
        client = stubClient();
        crypto = client.getCrypto()!;
        log = [];
        requests = [];
        dialogs = [];

        crypto.requestOwnUserVerification = jest.fn().mockImplementation(() => {
            const name = String(requests.length + 1);
            log.push(`request ${name}`);
            const request = makeRequest(name);
            requests.push(request);
            return Promise.resolve(request);
        });
        mocked(crypto.getVerificationRequestsToDeviceInProgress).mockImplementation(() => requests);

        jest.spyOn(Modal, "createDialog").mockImplementation(() => {
            const name = String(dialogs.length + 1);
            log.push(`open dialog ${name}`);
            const { promise, resolve } = Promise.withResolvers<[]>();
            const close = jest.fn(() => {
                log.push(`close dialog ${name}`);
                resolve([]);
            });
            dialogs.push({ close });
            return { finished: promise, close };
        });
    });

    afterEach(async () => {
        await Promise.all(requests.flatMap((request) => request.cancel.mock.results.map((result) => result.value)));
        jest.restoreAllMocks();
    });

    it("sends the request and opens the dialog synchronously when nothing is pending", () => {
        const onRequestSent = jest.fn(() => log.push("onRequestSent"));

        verifyWithAnotherDevice(client, { onRequestSent });

        expect(log).toEqual(["request 1", "onRequestSent", "open dialog 1"]);
        expect(Modal.createDialog).toHaveBeenCalledWith(VerificationRequestDialog, {
            verificationRequestPromise: expect.any(Promise),
            member: client.getUser(client.getSafeUserId()),
        });
    });

    it("counts a replaced request as a restart, but not a first request", async () => {
        verifyWithAnotherDevice(client);
        expect(lastVerificationRestartAt()).toBeNull();
        await flushPromises();

        await verifyWithAnotherDevice(client);
        expect(lastVerificationRestartAt()).not.toBeNull();
    });

    it("cancels the request and runs onDialogClosed when the user closes the dialog", async () => {
        const onDialogClosed = jest.fn();
        verifyWithAnotherDevice(client, { onDialogClosed });
        await flushPromises();

        dialogs[0].close();
        await flushPromises();

        expect(requests[0].cancel).toHaveBeenCalledTimes(1);
        expect(onDialogClosed).toHaveBeenCalledTimes(1);
    });

    it("on restart, closes the old dialog, then cancels the old request, then sends the new one", async () => {
        verifyWithAnotherDevice(client);
        await flushPromises();

        await verifyWithAnotherDevice(client);

        expect(log).toEqual([
            "request 1",
            "open dialog 1",
            "close dialog 1",
            "cancel 1",
            "cancel 1 sent",
            "request 2",
            "open dialog 2",
        ]);
    });

    it("does not treat the replaced dialog closing as the user finishing", async () => {
        const onDialogClosed = jest.fn();
        verifyWithAnotherDevice(client, { onDialogClosed });
        await flushPromises();

        await verifyWithAnotherDevice(client);
        await flushPromises();

        expect(onDialogClosed).not.toHaveBeenCalled();
        expect(requests[0].cancel).toHaveBeenCalledTimes(1);

        // The new dialog inherits the completion callback of the one it replaced.
        dialogs[1].close();
        await flushPromises();
        expect(requests[1].cancel).toHaveBeenCalledTimes(1);
        expect(onDialogClosed).toHaveBeenCalledTimes(1);
    });

    it("cancels other pending outgoing requests but leaves incoming ones alone", async () => {
        const untracked = makeRequest("untracked");
        const incoming = makeRequest("incoming", false);
        requests.push(untracked, incoming);

        await verifyWithAnotherDevice(client);

        expect(log).toEqual(["cancel untracked", "cancel untracked sent", "request 3", "open dialog 1"]);
        expect(incoming.cancel).not.toHaveBeenCalled();
    });

    it("runs overlapping restarts one at a time", async () => {
        verifyWithAnotherDevice(client);
        await flushPromises();

        await Promise.all([verifyWithAnotherDevice(client), verifyWithAnotherDevice(client)]);

        expect(log).toEqual([
            "request 1",
            "open dialog 1",
            "close dialog 1",
            "cancel 1",
            "cancel 1 sent",
            "request 2",
            "open dialog 2",
            "close dialog 2",
            "cancel 2",
            "cancel 2 sent",
            "request 3",
            "open dialog 3",
        ]);
    });

    describe("retryVerifyWithAnotherDevice", () => {
        it("hands the retry to the mounted verify button handler", () => {
            const handler = jest.fn().mockReturnValue(true);
            const unregister = registerVerifyButtonHandler(handler);

            expect(retryVerifyWithAnotherDevice(client)).toBe(true);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(crypto.requestOwnUserVerification).not.toHaveBeenCalled();
            expect(lastVerificationRestartAt()).not.toBeNull();
            unregister();
        });

        it("does not count a retry the mounted handler declined as a restart", () => {
            const unregister = registerVerifyButtonHandler(jest.fn().mockReturnValue(false));

            expect(retryVerifyWithAnotherDevice(client)).toBe(false);

            expect(lastVerificationRestartAt()).toBeNull();
            unregister();
        });

        it("uses the shared function when no verify button is mounted", () => {
            const unregister = registerVerifyButtonHandler(jest.fn());
            unregister();

            expect(retryVerifyWithAnotherDevice(client)).toBe(true);

            expect(log).toEqual(["request 1", "open dialog 1"]);
            expect(lastVerificationRestartAt()).not.toBeNull();
        });

        it("does nothing while another dialog is open", () => {
            jest.spyOn(Modal, "hasDialogs").mockReturnValue(true);

            expect(retryVerifyWithAnotherDevice(client)).toBe(false);

            expect(log).toEqual([]);
            expect(lastVerificationRestartAt()).toBeNull();
        });

        it("replaces the request when the open dialog is the one it tracks", async () => {
            verifyWithAnotherDevice(client);
            await flushPromises();
            jest.spyOn(Modal, "hasDialogs").mockReturnValue(true);

            expect(retryVerifyWithAnotherDevice(client)).toBe(true);
            await waitFor(() => expect(log).toContain("open dialog 2"));

            expect(log).toEqual([
                "request 1",
                "open dialog 1",
                "close dialog 1",
                "cancel 1",
                "cancel 1 sent",
                "request 2",
                "open dialog 2",
            ]);
        });
    });
});
