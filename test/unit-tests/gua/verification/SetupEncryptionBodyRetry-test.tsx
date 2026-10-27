/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import EventEmitter from "events";
import { act, render, screen } from "jest-matrix-react";
import { mocked } from "jest-mock";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { type CryptoApi, type VerificationRequest } from "matrix-js-sdk/src/crypto-api";

import SetupEncryptionBody from "../../../../src/components/structures/auth/SetupEncryptionBody";
import VerificationRequestDialog from "../../../../src/components/views/dialogs/VerificationRequestDialog";
import Modal from "../../../../src/Modal";
import { Phase, SetupEncryptionStore } from "../../../../src/stores/SetupEncryptionStore";
import {
    resetVerifyWithAnotherDevice,
    retryVerifyWithAnotherDevice,
} from "../../../../src/gua/verification/verifyWithAnotherDevice";
import { stubClient } from "../../../test-utils";

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

describe("SetupEncryptionBody retry request", () => {
    let client: MatrixClient;
    let crypto: CryptoApi;
    let store: MockSetupEncryptionStore;

    beforeEach(() => {
        resetVerifyWithAnotherDevice();
        client = stubClient();
        crypto = client.getCrypto()!;
        crypto.requestOwnUserVerification = jest.fn().mockResolvedValue({ cancel: jest.fn() });

        store = new MockSetupEncryptionStore();
        jest.spyOn(SetupEncryptionStore, "sharedInstance").mockReturnValue(store as unknown as SetupEncryptionStore);
        jest.spyOn(Modal, "createDialog").mockReturnValue({ finished: new Promise(() => {}), close: jest.fn() });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function calls(onFinished: jest.Mock): unknown[] {
        return [
            mocked(crypto.requestOwnUserVerification).mock.calls,
            onFinished.mock.calls,
            mocked(Modal.createDialog).mock.calls.map(([component, props]) => [
                component,
                Object.keys(props as object).sort(),
            ]),
        ];
    }

    it("behaves exactly like clicking 'Verify with another device'", () => {
        const clicked = jest.fn();
        const clickRender = render(<SetupEncryptionBody onFinished={clicked} />);
        act(() => screen.getByRole("button", { name: "Verify with another device" }).click());
        const afterClick = calls(clicked);
        clickRender.unmount();

        jest.clearAllMocks();
        resetVerifyWithAnotherDevice();

        const retried = jest.fn();
        render(<SetupEncryptionBody onFinished={retried} />);
        act(() => retryVerifyWithAnotherDevice(client));

        expect(calls(retried)).toEqual(afterClick);
        expect(crypto.requestOwnUserVerification).toHaveBeenCalledTimes(1);
        expect(retried).toHaveBeenCalledTimes(1);
        expect(Modal.createDialog).toHaveBeenCalledWith(VerificationRequestDialog, expect.anything());
    });

    it.each([Phase.Loading, Phase.Busy, Phase.ConfirmSkip])(
        "ignores the retry request while the body is in phase %s",
        (phase) => {
            store.phase = phase;
            const onFinished = jest.fn();
            render(<SetupEncryptionBody onFinished={onFinished} />);

            act(() => retryVerifyWithAnotherDevice(client));

            expect(crypto.requestOwnUserVerification).not.toHaveBeenCalled();
            expect(onFinished).not.toHaveBeenCalled();
            expect(Modal.createDialog).not.toHaveBeenCalled();
        },
    );

    it("falls back to the shared function once the body has unmounted", () => {
        const onFinished = jest.fn();
        const { unmount } = render(<SetupEncryptionBody onFinished={onFinished} />);
        unmount();

        act(() => retryVerifyWithAnotherDevice(client));

        expect(crypto.requestOwnUserVerification).toHaveBeenCalledTimes(1);
        expect(Modal.createDialog).toHaveBeenCalledWith(VerificationRequestDialog, expect.anything());
        expect(onFinished).not.toHaveBeenCalled();
    });
});
