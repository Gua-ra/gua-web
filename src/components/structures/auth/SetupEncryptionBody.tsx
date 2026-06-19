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
import VerificationRequestDialog from "../../views/dialogs/VerificationRequestDialog";
import { SetupEncryptionStore, Phase } from "../../../stores/SetupEncryptionStore";
import EncryptionPanel from "../../views/right_panel/EncryptionPanel";
import AccessibleButton, { type ButtonEvent } from "../../views/elements/AccessibleButton";
import Spinner from "../../views/elements/Spinner";
import { ResetIdentityDialog } from "../../views/dialogs/ResetIdentityDialog";

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
    // Gua: guard so the frictionless auto-reset is only kicked off once, even if
    // the store emits multiple "update" events before the reset flow completes.
    private autoResetTriggered = false;

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
        // Gua: if we already know on mount that the only possible outcome is a
        // reset (no other verified device and no recovery key), don't render the
        // "Unable to verify this device → Proceed with reset" dead-end — just
        // reset silently and continue into the app.
        this.maybeAutoReset();
    }

    /**
     * Gua frictionless auto-reset.
     *
     * When {@link SetupEncryptionStore.lostKeys} is true there is nothing to
     * verify against (no other verified device, no recovery key) so a reset is
     * the *only* outcome the user could pick on the Intro screen. Rather than
     * making them click through the "Proceed with reset" confirmation, kick off
     * the existing reset flow automatically. The reset persists fresh
     * cross-signing keys and self-signs this device once its key-upload UIA
     * completes (against MAS/OIDC via {@link uiAuthCallback}).
     */
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
        // Gua: the store may only learn it has lost its keys after start() has
        // resolved, so re-evaluate the auto-reset on every update too.
        this.maybeAutoReset();
    };

    public componentWillUnmount(): void {
        const store = SetupEncryptionStore.sharedInstance();
        store.off("update", this.onStoreUpdate);
        store.stop();
    }

    private onUsePassphraseClick = async (): Promise<void> => {
        const store = SetupEncryptionStore.sharedInstance();
        store.usePassPhrase();
    };

    private onVerifyClick = (): void => {
        const cli = MatrixClientPeg.safeGet();
        const userId = cli.getSafeUserId();
        const requestPromise = cli.getCrypto()!.requestOwnUserVerification();

        // We need to call onFinished now to close this dialog, and
        // again later to signal that the verification is complete.
        this.props.onFinished();
        const { finished: verificationFinished } = Modal.createDialog(VerificationRequestDialog, {
            verificationRequestPromise: requestPromise,
            member: cli.getUser(userId) ?? undefined,
        });

        verificationFinished.then(async () => {
            const request = await requestPromise;
            request.cancel();
            this.props.onFinished();
        });
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

    /**
     * Open the reset-identity flow. Shared by the explicit "Reset all" link (in
     * the normal Intro branch) and the Gua frictionless auto-reset.
     *
     * The reset itself runs in {@link ResetIdentityBody}, which calls
     * `getCrypto().resetEncryption(uiAuthCallback)`. On MAS/OIDC the key-upload
     * UIA is satisfied via the `org.matrix.cross_signing_reset` redirect stage
     * (`MasUnlockCrossSigningAuthEntry`): the user is bounced to their account
     * to confirm, then the upload completes so the fresh identity persists and
     * we stop re-prompting on subsequent logins.
     */
    private startReset(): void {
        Modal.createDialog(ResetIdentityDialog, {
            onReset: () => {
                // The reset completed - close this dialog and continue into the app
                this.props.onFinished();
                const store = SetupEncryptionStore.sharedInstance();
                store.done();
            },
            variant: "confirm",
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
                // Gua: a reset is the only possible outcome here, so we kick it
                // off automatically (see maybeAutoReset). Render a spinner as the
                // backdrop while the reset dialog opens and runs, rather than the
                // "Unable to verify this device → Proceed with reset" dead-end.
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
