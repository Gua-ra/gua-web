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
import { ResetIdentityDialog } from "../../../../src/components/views/dialogs/ResetIdentityDialog";
import Modal from "../../../../src/Modal";
import { Phase, SetupEncryptionStore } from "../../../../src/stores/SetupEncryptionStore";
import {
    resetVerifyWithAnotherDevice,
    retryVerifyWithAnotherDevice,
} from "../../../../src/gua/verification/verifyWithAnotherDevice";
import { flushPromises, stubClient } from "../../../test-utils";

class MockSetupEncryptionStore extends EventEmitter {
    public phase: Phase = Phase.Intro;
    public verificationRequest: VerificationRequest | null = null;
    public backupInfo = null;
    public keyInfo = null;
    public hasDevicesToVerifyAgainst = true;
    public keysLost = false;
    public lostKeys(): boolean {
        return this.keysLost;
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

    function retry(): boolean {
        let acted = false;
        act(() => {
            acted = retryVerifyWithAnotherDevice(client);
        });
        return acted;
    }

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

    it("ignores the retry request when only a reset can help", async () => {
        store.keysLost = true;
        // Let the automatic reset dialog close so only the lostKeys guard is under test.
        mocked(Modal.createDialog).mockReturnValue({ finished: Promise.resolve([]), close: jest.fn() });
        const onFinished = jest.fn();
        render(<SetupEncryptionBody onFinished={onFinished} />);
        await flushPromises();

        expect(retry()).toBe(false);

        expect(crypto.requestOwnUserVerification).not.toHaveBeenCalled();
        expect(Modal.createDialog).not.toHaveBeenCalledWith(VerificationRequestDialog, expect.anything());
    });

    it("ignores the retry request while an incoming request is shown in place", () => {
        store.verificationRequest = { otherUserId: client.getSafeUserId() } as VerificationRequest;
        mocked(client.getUser).mockReturnValue(null);
        const onFinished = jest.fn();
        render(<SetupEncryptionBody onFinished={onFinished} />);

        expect(retry()).toBe(false);

        expect(crypto.requestOwnUserVerification).not.toHaveBeenCalled();
        expect(onFinished).not.toHaveBeenCalled();
    });

    it("ignores the retry request while a reset started from the body is open", async () => {
        const reset = Promise.withResolvers<[]>();
        mocked(Modal.createDialog).mockReturnValueOnce({ finished: reset.promise, close: jest.fn() });
        const onFinished = jest.fn();
        render(<SetupEncryptionBody onFinished={onFinished} />);
        act(() => screen.getByRole("button", { name: "Reset all" }).click());
        expect(Modal.createDialog).toHaveBeenCalledWith(ResetIdentityDialog, expect.anything());

        expect(retry()).toBe(false);
        expect(crypto.requestOwnUserVerification).not.toHaveBeenCalled();
        expect(onFinished).not.toHaveBeenCalled();

        reset.resolve([]);
        await flushPromises();
        expect(retry()).toBe(true);
        expect(crypto.requestOwnUserVerification).toHaveBeenCalledTimes(1);
    });

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
