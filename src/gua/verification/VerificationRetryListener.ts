/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { ClientEvent, type MatrixClient, type ReceivedToDeviceMessage, SyncState } from "matrix-js-sdk/src/matrix";
import { type VerificationRequest, VerificationPhase } from "matrix-js-sdk/src/crypto-api";
import { logger as baseLogger } from "matrix-js-sdk/src/logger";

import {
    lastVerificationRestartAt,
    resetVerifyWithAnotherDevice,
    retryVerifyWithAnotherDevice,
} from "./verifyWithAnotherDevice";

export const RETRY_REQUEST_EVENT_TYPE = "global.gua.verification.retry_request";

export const RESTART_DEBOUNCE_MS = 15_000;

const logger = baseLogger.getChild("GuaVerificationRetryListener:");

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
        // A request queued while this client was closed or offline carries no timestamp and may be hours old.
        if (!isLive(client)) {
            logger.info("Ignoring a verification retry request delivered while catching up");
            return;
        }
        void this.onRetryRequest(client, message.content?.from_device);
    };

    private async onRetryRequest(client: MatrixClient, fromDevice: unknown): Promise<void> {
        if (this.evaluating || this.restartedRecently()) return;
        this.evaluating = true;
        try {
            if (!(await this.canRestart(client))) return;
            if (client !== this.client || this.restartedRecently()) return;
            const acted = retryVerifyWithAnotherDevice(client);
            logger.info(
                `Device ${String(fromDevice)} asked for a new verification request; ` +
                    (acted ? "sending one" : "busy, ignoring it"),
            );
        } catch (e) {
            logger.warn("Could not handle the verification retry request", e);
        } finally {
            this.evaluating = false;
        }
    }

    private restartedRecently(): boolean {
        const restartedAt = lastVerificationRestartAt();
        return restartedAt !== null && Date.now() - restartedAt < RESTART_DEBOUNCE_MS;
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

/** A new request would cancel an incoming one, so only our own request still in Requested may be replaced. */
function blocksRestart(request: VerificationRequest): boolean {
    if (!request.pending) return false;
    if (request.phase === VerificationPhase.Ready || request.phase === VerificationPhase.Started) return true;
    return !request.initiatedByMe;
}

/** The SDK delivers the queued to-device backlog before the sync state reaches Syncing with catchingUp false. */
function isLive(client: MatrixClient): boolean {
    return client.getSyncState() === SyncState.Syncing && !client.getSyncStateData()?.catchingUp;
}
