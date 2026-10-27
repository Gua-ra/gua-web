/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { ClientEvent, type MatrixClient, type ReceivedToDeviceMessage } from "matrix-js-sdk/src/matrix";
import { type VerificationRequest, VerificationPhase } from "matrix-js-sdk/src/crypto-api";
import { logger as baseLogger } from "matrix-js-sdk/src/logger";

import {
    lastVerificationRequestStartedAt,
    resetVerifyWithAnotherDevice,
    retryVerifyWithAnotherDevice,
} from "./verifyWithAnotherDevice";

/**
 * Sent unencrypted by one of our verified devices once it has this device's keys, asking us to send our
 * verification request again (it dropped the first one because it could not look this device up yet).
 */
export const RETRY_REQUEST_EVENT_TYPE = "global.gua.verification.retry_request";

export const RESTART_DEBOUNCE_MS = 15_000;

const logger = baseLogger.getChild("GuaVerificationRetryListener:");

/** Re-sends "Verify with another device" when another of our devices asks for it. */
export default class VerificationRetryListener {
    private static instance?: VerificationRetryListener;
    private client?: MatrixClient;
    private evaluating = false;

    public static sharedInstance(): VerificationRetryListener {
        if (!VerificationRetryListener.instance) VerificationRetryListener.instance = new VerificationRetryListener();
        return VerificationRetryListener.instance;
    }

    public start(client: MatrixClient): void {
        this.stop();
        this.client = client;
        client.on(ClientEvent.ReceivedToDeviceMessage, this.onToDeviceMessage);
    }

    public stop(): void {
        this.client?.removeListener(ClientEvent.ReceivedToDeviceMessage, this.onToDeviceMessage);
        this.client = undefined;
        this.evaluating = false;
        resetVerifyWithAnotherDevice();
    }

    private onToDeviceMessage = ({ message }: ReceivedToDeviceMessage): void => {
        if (message.type !== RETRY_REQUEST_EVENT_TYPE) return;
        const client = this.client;
        // The event carries no secrets, but only our own devices may ask us to restart.
        if (!client || message.sender !== client.getUserId()) return;
        void this.onRetryRequest(client, message.content?.from_device);
    };

    private async onRetryRequest(client: MatrixClient, fromDevice: unknown): Promise<void> {
        if (this.evaluating || this.restartedRecently()) return;
        this.evaluating = true;
        try {
            if (!(await this.canRestart(client))) return;
            if (client !== this.client || this.restartedRecently()) return;
            logger.info(`Device ${String(fromDevice)} asked for a new verification request; sending one`);
            retryVerifyWithAnotherDevice(client);
        } catch (e) {
            logger.warn("Could not handle the verification retry request", e);
        } finally {
            this.evaluating = false;
        }
    }

    private restartedRecently(): boolean {
        const startedAt = lastVerificationRequestStartedAt();
        return startedAt !== null && Date.now() - startedAt < RESTART_DEBOUNCE_MS;
    }

    private async canRestart(client: MatrixClient): Promise<boolean> {
        const crypto = client.getCrypto();
        const deviceId = client.getDeviceId();
        if (!crypto || !deviceId) return false;
        const userId = client.getSafeUserId();

        const status = await crypto.getDeviceVerificationStatus(userId, deviceId);
        if (status?.crossSigningVerified) return false;
        if (!(await crypto.userHasCrossSigningKeys(userId))) return false;
        return !crypto.getVerificationRequestsToDeviceInProgress(userId).some(blocksRestart);
    }
}

/**
 * A verification past the Requested phase is under way, and an incoming request still in Requested would be
 * cancelled together with our new one. Only our own outgoing Requested request may be replaced.
 */
function blocksRestart(request: VerificationRequest): boolean {
    if (!request.pending) return false;
    if (request.phase === VerificationPhase.Ready || request.phase === VerificationPhase.Started) return true;
    return !request.initiatedByMe;
}
