/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { mocked } from "jest-mock";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk/src/matrix";
import {
    type CryptoApi,
    type DeviceVerificationStatus,
    VerificationPhase,
    type VerificationRequest,
} from "matrix-js-sdk/src/crypto-api";

import VerificationRetryListener, {
    RESTART_DEBOUNCE_MS,
    RETRY_REQUEST_EVENT_TYPE,
} from "../../../../src/gua/verification/VerificationRetryListener";
import {
    lastVerificationRequestStartedAt,
    resetVerifyWithAnotherDevice,
    retryVerifyWithAnotherDevice,
} from "../../../../src/gua/verification/verifyWithAnotherDevice";
import { flushPromises, stubClient } from "../../../test-utils";

jest.mock("../../../../src/gua/verification/verifyWithAnotherDevice", () => ({
    lastVerificationRequestStartedAt: jest.fn(),
    resetVerifyWithAnotherDevice: jest.fn(),
    retryVerifyWithAnotherDevice: jest.fn(),
}));

describe("VerificationRetryListener", () => {
    let client: MatrixClient;
    let crypto: CryptoApi;
    let listener: VerificationRetryListener;
    let startedAt: number | null;

    function nudge(sender = client.getSafeUserId(), type = RETRY_REQUEST_EVENT_TYPE): void {
        client.emit(ClientEvent.ReceivedToDeviceMessage, {
            message: { type, sender, content: { from_device: "PHONE" } },
            encryptionInfo: null,
        });
    }

    function makeRequest(phase: VerificationPhase, initiatedByMe: boolean): VerificationRequest {
        return {
            phase,
            initiatedByMe,
            pending: phase !== VerificationPhase.Cancelled && phase !== VerificationPhase.Done,
        } as unknown as VerificationRequest;
    }

    beforeEach(() => {
        client = stubClient();
        crypto = client.getCrypto()!;
        mocked(crypto.getDeviceVerificationStatus).mockResolvedValue({
            crossSigningVerified: false,
        } as DeviceVerificationStatus);
        crypto.userHasCrossSigningKeys = jest.fn().mockResolvedValue(true);
        mocked(crypto.getVerificationRequestsToDeviceInProgress).mockReturnValue([]);

        startedAt = null;
        mocked(lastVerificationRequestStartedAt).mockImplementation(() => startedAt);
        mocked(retryVerifyWithAnotherDevice).mockImplementation(() => {
            startedAt = Date.now();
        });

        listener = new VerificationRetryListener();
        listener.start(client);
    });

    afterEach(() => {
        listener.stop();
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it("restarts verification when one of our own devices asks", async () => {
        nudge();
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).toHaveBeenCalledWith(client);
    });

    it("ignores a retry request from another user", async () => {
        nudge("@mallory:matrix.org");
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).not.toHaveBeenCalled();
    });

    it("ignores other to-device events from our own devices", async () => {
        nudge(client.getSafeUserId(), "m.key.verification.request");
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).not.toHaveBeenCalled();
    });

    it("ignores the request once this device is cross-signed", async () => {
        mocked(crypto.getDeviceVerificationStatus).mockResolvedValue({
            crossSigningVerified: true,
        } as DeviceVerificationStatus);

        nudge();
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).not.toHaveBeenCalled();
    });

    it("ignores the request when the account has no cross-signing keys", async () => {
        mocked(crypto.userHasCrossSigningKeys).mockResolvedValue(false);

        nudge();
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).not.toHaveBeenCalled();
    });

    it.each([
        ["an accepted request", makeRequest(VerificationPhase.Ready, true)],
        ["a started verification", makeRequest(VerificationPhase.Started, false)],
        ["an incoming request waiting for an answer", makeRequest(VerificationPhase.Requested, false)],
    ])("ignores the request while there is %s", async (_, request) => {
        mocked(crypto.getVerificationRequestsToDeviceInProgress).mockReturnValue([request]);

        nudge();
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).not.toHaveBeenCalled();
    });

    it("replaces our own outgoing request that is still waiting", async () => {
        mocked(crypto.getVerificationRequestsToDeviceInProgress).mockReturnValue([
            makeRequest(VerificationPhase.Requested, true),
            makeRequest(VerificationPhase.Cancelled, false),
            makeRequest(VerificationPhase.Done, true),
        ]);

        nudge();
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).toHaveBeenCalledTimes(1);
    });

    it("ignores requests within 15 s of the last restart", async () => {
        const now = Date.now();
        jest.spyOn(Date, "now").mockReturnValue(now);
        nudge();
        await flushPromises();
        expect(retryVerifyWithAnotherDevice).toHaveBeenCalledTimes(1);

        jest.spyOn(Date, "now").mockReturnValue(now + RESTART_DEBOUNCE_MS - 1);
        nudge();
        await flushPromises();
        expect(retryVerifyWithAnotherDevice).toHaveBeenCalledTimes(1);

        jest.spyOn(Date, "now").mockReturnValue(now + RESTART_DEBOUNCE_MS);
        nudge();
        await flushPromises();
        expect(retryVerifyWithAnotherDevice).toHaveBeenCalledTimes(2);
    });

    it("acts once on requests that arrive together", async () => {
        mocked(retryVerifyWithAnotherDevice).mockImplementation(() => {});

        nudge();
        nudge();
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).toHaveBeenCalledTimes(1);
    });

    it("stops listening and forgets the tracked request when stopped", async () => {
        listener.stop();
        expect(resetVerifyWithAnotherDevice).toHaveBeenCalled();

        nudge();
        await flushPromises();

        expect(retryVerifyWithAnotherDevice).not.toHaveBeenCalled();
    });
});
