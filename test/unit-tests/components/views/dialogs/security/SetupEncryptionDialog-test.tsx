/*
Copyright 2024 New Vector Ltd.
Copyright 2018-2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen, waitFor } from "jest-matrix-react";
import { type Mocked } from "jest-mock";
import { type CryptoApi } from "matrix-js-sdk/src/crypto-api";

import SetupEncryptionDialog from "../../../../../../src/components/views/dialogs/security/SetupEncryptionDialog";
import { getMockClientWithEventEmitter } from "../../../../../test-utils";
import { Phase, SetupEncryptionStore } from "../../../../../../src/stores/SetupEncryptionStore";
import Modal from "../../../../../../src/Modal";

describe("SetupEncryptionDialog", () => {
    afterEach(() => {
        jest.resetAllMocks();
        jest.restoreAllMocks();
    });

    it("should reset automatically when there is nothing to verify against, then be finished", async () => {
        mockClient();
        const store = new SetupEncryptionStore();
        jest.spyOn(SetupEncryptionStore, "sharedInstance").mockReturnValue(store);

        // Given when you open the reset dialog we immediately reset
        const createDialog = jest.spyOn(Modal, "createDialog").mockImplementation((_, props) => {
            // Simulate doing the reset in the dialog
            props?.onReset();

            return {
                close: jest.fn(),
                finished: Promise.resolve([]),
            };
        });

        // When we launch the dialog and the store finds no other device and no key backup
        const onFinished = jest.fn();
        render(<SetupEncryptionDialog onFinished={onFinished} />);

        // Then Gua opens the reset straight away instead of asking to "Proceed with reset",
        // and the phase has been set to Finished
        await waitFor(() => expect(store.phase).toBe(Phase.Finished));
        expect(createDialog).toHaveBeenCalledTimes(1);
        expect(onFinished).toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Proceed with reset" })).not.toBeInTheDocument();
    });
});

function mockClient() {
    const mockCrypto = {
        getDeviceVerificationStatus: jest.fn().mockResolvedValue({
            crossSigningVerified: false,
        }),
        getUserDeviceInfo: jest.fn().mockResolvedValue(new Map()),
        isCrossSigningReady: jest.fn().mockResolvedValue(true),
        isSecretStorageReady: jest.fn().mockResolvedValue(true),
        userHasCrossSigningKeys: jest.fn(),
        getActiveSessionBackupVersion: jest.fn(),
        getCrossSigningStatus: jest.fn().mockReturnValue({
            publicKeysOnDevice: true,
            privateKeysInSecretStorage: true,
            privateKeysCachedLocally: {
                masterKey: true,
                selfSigningKey: true,
                userSigningKey: true,
            },
        }),
        getSessionBackupPrivateKey: jest.fn(),
        isEncryptionEnabledInRoom: jest.fn(),
        getKeyBackupInfo: jest.fn().mockResolvedValue(null),
        getVerificationRequestsToDeviceInProgress: jest.fn().mockReturnValue([]),
    } as unknown as Mocked<CryptoApi>;

    const userId = "@user:server";

    getMockClientWithEventEmitter({
        getCrypto: jest.fn().mockReturnValue(mockCrypto),
        getUserId: jest.fn().mockReturnValue(userId),
        secretStorage: { isStored: jest.fn().mockReturnValue({}) },
    });
}
