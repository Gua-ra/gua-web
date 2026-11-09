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
    onRequestSent?: () => void;
    /** Carried over to the replacing dialog when a newer request replaces this one. */
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

/** Set when a pending request is replaced or a retry is acted on, not by a first request with nothing to replace. */
export function lastVerificationRestartAt(): number | null {
    return lastRestartedAt;
}

export function verifyWithAnotherDevice(
    cli: MatrixClient,
    options: VerifyWithAnotherDeviceOptions = {},
): Promise<void> {
    const previous = restarting;
    if (!previous && !current && pendingOutgoingRequests(cli).length === 0) {
        // Synchronous so onRequestSent runs before the click handler returns.
        openRequest(cli, options);
        return Promise.resolve();
    }
    lastRestartedAt = Date.now();
    // Two live requests between our own devices cancel each other, so each restart waits for the previous cancel.
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

/** Retries go through the mounted SetupEncryptionBody so they behave exactly like a click on its button. */
export function registerVerifyButtonHandler(handler: () => boolean): () => void {
    verifyButtonHandler = handler;
    return () => {
        if (verifyButtonHandler === handler) verifyButtonHandler = null;
    };
}

export function retryVerifyWithAnotherDevice(cli: MatrixClient): boolean {
    if (verifyButtonHandler) {
        if (!verifyButtonHandler()) return false;
    } else {
        // Never act over a dialog other than our own, which may be mid-flow.
        if (Modal.hasDialogs() && !current) return false;
        void verifyWithAnotherDevice(cli);
    }
    lastRestartedAt = Date.now();
    return true;
}

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
