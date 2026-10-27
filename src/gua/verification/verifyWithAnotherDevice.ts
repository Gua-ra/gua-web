/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { type VerificationRequest } from "matrix-js-sdk/src/crypto-api";
import { logger as baseLogger } from "matrix-js-sdk/src/logger";

import Modal from "../../Modal";
import VerificationRequestDialog from "../../components/views/dialogs/VerificationRequestDialog";

const logger = baseLogger.getChild("GuaVerifyWithAnotherDevice:");

export interface VerifyWithAnotherDeviceOptions {
    /** Runs right after the new request is started, before its dialog opens. */
    onRequestSent?: () => void;
    /** Runs when the dialog closes, unless a newer request replaced it first. */
    onDialogClosed?: () => void;
}

interface OutgoingAttempt {
    requestPromise: Promise<VerificationRequest>;
    closeDialog: () => void;
    onDialogClosed?: () => void;
    replaced: boolean;
}

let current: OutgoingAttempt | null = null;
let restarting: Promise<void> | null = null;
let lastRestartedAt: number | null = null;
let verifyButtonHandler: (() => boolean) | null = null;

/**
 * When this device last restarted its own-user verification: replaced a pending request, or acted on a retry
 * request. A first request with nothing to replace is not a restart.
 */
export function lastVerificationRestartAt(): number | null {
    return lastRestartedAt;
}

/**
 * What "Verify with another device" does: close the dialog of our pending outgoing self-verification request,
 * cancel every such request this device started, then send a fresh one and open a {@link VerificationRequestDialog}.
 */
export function verifyWithAnotherDevice(
    cli: MatrixClient,
    options: VerifyWithAnotherDeviceOptions = {},
): Promise<void> {
    const previous = restarting;
    if (!previous && !current && pendingOutgoingRequests(cli).length === 0) {
        // Nothing to replace: send and open synchronously so onRequestSent runs before the click handler returns.
        openRequest(cli, options);
        return Promise.resolve();
    }
    lastRestartedAt = Date.now();
    // Two live requests between our own devices cancel each other, so restarts run one at a time and each
    // new request is only sent once the previous one is cancelled.
    const run: Promise<void> = (previous ?? Promise.resolve())
        .then(async () => {
            const inheritedOnDialogClosed = await retireOutgoing(cli);
            openRequest(cli, options, inheritedOnDialogClosed);
        })
        .catch((e) => logger.warn("Could not restart the verification request", e))
        .finally(() => {
            if (restarting === run) restarting = null;
        });
    restarting = run;
    return run;
}

/**
 * Lets the mounted SetupEncryptionBody take a retry request, so it behaves exactly like a click on its button.
 * The handler returns whether it acted. Returns the function that removes the handler again.
 */
export function registerVerifyButtonHandler(handler: () => boolean): () => void {
    verifyButtonHandler = handler;
    return () => {
        if (verifyButtonHandler === handler) verifyButtonHandler = null;
    };
}

/**
 * Re-runs "Verify with another device": through the mounted SetupEncryptionBody if there is one.
 * Returns whether it did.
 */
export function retryVerifyWithAnotherDevice(cli: MatrixClient): boolean {
    if (verifyButtonHandler) {
        if (!verifyButtonHandler()) return false;
    } else {
        // Any other open dialog may be mid-flow (an identity reset from Settings, for one): never act over it.
        if (Modal.hasDialogs() && !current) return false;
        void verifyWithAnotherDevice(cli);
    }
    lastRestartedAt = Date.now();
    return true;
}

/** Forgets the tracked request and dialog, for when the client stops. */
export function resetVerifyWithAnotherDevice(): void {
    current = null;
    restarting = null;
    lastRestartedAt = null;
}

function pendingOutgoingRequests(cli: MatrixClient): VerificationRequest[] {
    const crypto = cli.getCrypto();
    if (!crypto) return [];
    return crypto
        .getVerificationRequestsToDeviceInProgress(cli.getSafeUserId())
        .filter((request) => request.initiatedByMe && request.pending);
}

function openRequest(cli: MatrixClient, options: VerifyWithAnotherDeviceOptions, inherited?: () => void): void {
    const userId = cli.getSafeUserId();
    const requestPromise = cli.getCrypto()!.requestOwnUserVerification();
    options.onRequestSent?.();
    const { finished, close } = Modal.createDialog(VerificationRequestDialog, {
        verificationRequestPromise: requestPromise,
        member: cli.getUser(userId) ?? undefined,
    });
    const attempt: OutgoingAttempt = {
        requestPromise,
        closeDialog: () => close(),
        onDialogClosed: options.onDialogClosed ?? inherited,
        replaced: false,
    };
    current = attempt;

    finished.then(async () => {
        if (attempt.replaced) return;
        if (current === attempt) current = null;
        const request = await requestPromise;
        request.cancel();
        attempt.onDialogClosed?.();
    });
}

/** Closes the tracked dialog, then cancels every pending outgoing self-verification request. */
async function retireOutgoing(cli: MatrixClient): Promise<(() => void) | undefined> {
    const previous = current;
    current = null;
    if (previous) {
        previous.replaced = true;
        // Closing first keeps the old dialog from flashing its "Verification cancelled" phase.
        previous.closeDialog();
        try {
            await (await previous.requestPromise).cancel();
        } catch (e) {
            logger.warn("Could not cancel the previous verification request", e);
        }
    }
    for (const request of pendingOutgoingRequests(cli)) {
        try {
            await request.cancel();
        } catch (e) {
            logger.warn("Could not cancel a pending verification request", e);
        }
    }
    return previous?.onDialogClosed;
}
