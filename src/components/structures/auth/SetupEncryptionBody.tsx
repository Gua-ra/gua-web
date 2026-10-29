/*
Copyright 2024, 2025 New Vector Ltd.
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { type KeyBackupInfo, type VerificationRequest } from "matrix-js-sdk/src/crypto-api";
import { logger } from "matrix-js-sdk/src/logger";
import { type SecretStorageKeyDescription } from "matrix-js-sdk/src/secret-storage";

import { _t } from "../../../languageHandler";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import Modal from "../../../Modal";
import { SetupEncryptionStore, Phase } from "../../../stores/SetupEncryptionStore";
import EncryptionPanel from "../../views/right_panel/EncryptionPanel";
import AccessibleButton, { type ButtonEvent } from "../../views/elements/AccessibleButton";
import Spinner from "../../views/elements/Spinner";
import { ResetIdentityDialog } from "../../views/dialogs/ResetIdentityDialog";
import {
    registerVerifyButtonHandler,
    verifyWithAnotherDevice,
} from "../../../gua/verification/verifyWithAnotherDevice";

function keyHasPassphrase(keyInfo: SecretStorageKeyDescription): boolean {
    return Boolean(keyInfo.passphrase && keyInfo.passphrase.salt && keyInfo.passphrase.iterations);
}

interface IProps {
    onFinished: () => void;
}

interface IState {
    phase?: Phase;
    verificationRequest: VerificationRequest | null;
    backupInfo: KeyBackupInfo | null;
    lostKeys: boolean;
}

export default class SetupEncryptionBody extends React.Component<IProps, IState> {
    private autoResetTriggered = false;
    private unregisterVerifyButtonHandler?: () => void;
    // Gua: the reset runs in dialogs over this body while its phase stays Intro.
    private resetInProgress = false;

    public constructor(props: IProps) {
        super(props);
        const store = SetupEncryptionStore.sharedInstance();
        store.start();
        this.state = {
            phase: store.phase,
            // this serves dual purpose as the object for the request logic and
            // the presence of it indicating that we're in 'verify mode'.
            // Because of the latter, it lives in the state.
            verificationRequest: store.verificationRequest,
            backupInfo: store.backupInfo,
            lostKeys: store.lostKeys(),
        };
    }

    public componentDidMount(): void {
        const store = SetupEncryptionStore.sharedInstance();
        store.on("update", this.onStoreUpdate);
        this.unregisterVerifyButtonHandler = registerVerifyButtonHandler(this.onRetryRequested);
        this.maybeAutoReset();
    }

    // Gua: with lost keys a reset is the only possible outcome, so open it straight away.
    private maybeAutoReset(): void {
        if (this.autoResetTriggered) return;
        const store = SetupEncryptionStore.sharedInstance();
        if (store.phase === Phase.Intro && store.lostKeys()) {
            this.autoResetTriggered = true;
            this.startReset();
        }
    }

    private onStoreUpdate = (): void => {
        const store = SetupEncryptionStore.sharedInstance();
        if (store.phase === Phase.Finished) {
            this.props.onFinished();
            return;
        }
        this.setState({
            phase: store.phase,
            verificationRequest: store.verificationRequest,
            backupInfo: store.backupInfo,
            lostKeys: store.lostKeys(),
        });
        // Gua: lostKeys is only known once the store's async key lookup finishes.
        this.maybeAutoReset();
    };

    public componentWillUnmount(): void {
        const store = SetupEncryptionStore.sharedInstance();
        store.off("update", this.onStoreUpdate);
        this.unregisterVerifyButtonHandler?.();
        store.stop();
    }

    private onUsePassphraseClick = async (): Promise<void> => {
        const store = SetupEncryptionStore.sharedInstance();
        store.usePassPhrase();
    };

    private onVerifyClick = (): void => {
        // We need to call onFinished now to close this dialog, and
        // again later to signal that the verification is complete.
        void verifyWithAnotherDevice(MatrixClientPeg.safeGet(), {
            onRequestSent: () => this.props.onFinished(),
            onDialogClosed: () => this.props.onFinished(),
        });
    };

    // Gua: take a retry only while the Intro choices are showing and nothing covers them.
    private onRetryRequested = (): boolean => {
        const { verificationRequest, phase, lostKeys } = this.state;
        if (this.resetInProgress || verificationRequest || phase !== Phase.Intro || lostKeys) return false;
        this.onVerifyClick();
        return true;
    };

    private onSkipConfirmClick = (): void => {
        const store = SetupEncryptionStore.sharedInstance();
        store.skipConfirm();
    };

    private onSkipBackClick = (): void => {
        const store = SetupEncryptionStore.sharedInstance();
        store.returnAfterSkip();
    };

    private onResetClick = (ev: ButtonEvent): void => {
        ev.preventDefault();
        this.startReset();
    };

    private startReset(): void {
        this.resetInProgress = true;
        const { finished } = Modal.createDialog(ResetIdentityDialog, {
            onReset: () => {
                // The user completed the reset process - close this dialog
                this.props.onFinished();
                const store = SetupEncryptionStore.sharedInstance();
                store.done();
            },
            variant: "confirm",
        });
        finished.then(() => {
            this.resetInProgress = false;
        });
    }

    private onDoneClick = (): void => {
        const store = SetupEncryptionStore.sharedInstance();
        store.done();
    };

    private onEncryptionPanelClose = (): void => {
        this.props.onFinished();
    };

    public render(): React.ReactNode {
        const cli = MatrixClientPeg.safeGet();
        const { phase, lostKeys } = this.state;

        if (this.state.verificationRequest && cli.getUser(this.state.verificationRequest.otherUserId)) {
            return (
                <EncryptionPanel
                    layout="dialog"
                    verificationRequest={this.state.verificationRequest}
                    onClose={this.onEncryptionPanelClose}
                    member={cli.getUser(this.state.verificationRequest.otherUserId)!}
                    isRoomEncrypted={false}
                />
            );
        } else if (phase === Phase.Intro) {
            if (lostKeys) {
                // Gua: backdrop while maybeAutoReset runs the reset.
                return <Spinner />;
            } else {
                const store = SetupEncryptionStore.sharedInstance();
                let recoveryKeyPrompt;
                if (store.keyInfo && keyHasPassphrase(store.keyInfo)) {
                    recoveryKeyPrompt = _t("encryption|verification|verify_using_key_or_phrase");
                } else if (store.keyInfo) {
                    recoveryKeyPrompt = _t("encryption|verification|verify_using_key");
                }

                let useRecoveryKeyButton;
                if (recoveryKeyPrompt) {
                    useRecoveryKeyButton = (
                        <AccessibleButton kind="primary" onClick={this.onUsePassphraseClick}>
                            {recoveryKeyPrompt}
                        </AccessibleButton>
                    );
                }

                let verifyButton;
                if (store.hasDevicesToVerifyAgainst) {
                    verifyButton = (
                        <AccessibleButton kind="primary" onClick={this.onVerifyClick}>
                            {_t("encryption|verification|verify_using_device")}
                        </AccessibleButton>
                    );
                }

                return (
                    <div>
                        <p>{_t("encryption|verification|verification_description")}</p>

                        <div className="mx_CompleteSecurity_actionRow">
                            {verifyButton}
                            {useRecoveryKeyButton}
                        </div>
                        <div className="mx_SetupEncryptionBody_reset">
                            {_t("encryption|reset_all_button", undefined, {
                                a: (sub) => (
                                    <AccessibleButton
                                        kind="link_inline"
                                        className="mx_SetupEncryptionBody_reset_link"
                                        onClick={this.onResetClick}
                                    >
                                        {sub}
                                    </AccessibleButton>
                                ),
                            })}
                        </div>
                    </div>
                );
            }
        } else if (phase === Phase.Done) {
            let message: JSX.Element;
            if (this.state.backupInfo) {
                message = <p>{_t("encryption|verification|verification_success_with_backup")}</p>;
            } else {
                message = <p>{_t("encryption|verification|verification_success_without_backup")}</p>;
            }
            return (
                <div>
                    <div className="mx_CompleteSecurity_heroIcon mx_E2EIcon_verified" />
                    {message}
                    <div className="mx_CompleteSecurity_actionRow">
                        <AccessibleButton kind="primary" onClick={this.onDoneClick}>
                            {_t("action|done")}
                        </AccessibleButton>
                    </div>
                </div>
            );
        } else if (phase === Phase.ConfirmSkip) {
            return (
                <div>
                    <p>{_t("encryption|verification|verification_skip_warning")}</p>
                    <div className="mx_CompleteSecurity_actionRow">
                        <AccessibleButton kind="danger_outline" onClick={this.onSkipConfirmClick}>
                            {_t("encryption|verification|verify_later")}
                        </AccessibleButton>
                        <AccessibleButton kind="primary" onClick={this.onSkipBackClick}>
                            {_t("action|go_back")}
                        </AccessibleButton>
                    </div>
                </div>
            );
        } else if (phase === Phase.Busy || phase === Phase.Loading) {
            return <Spinner />;
        } else {
            logger.log(`SetupEncryptionBody: Unknown phase ${phase}`);
        }
    }
}
