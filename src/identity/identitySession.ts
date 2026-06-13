/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type IMatrixClientCreds } from "../MatrixClientPeg";
import SdkConfig from "../SdkConfig";
import { type IdentityServiceDeviceInfo, type IdentityServiceMatrixSession } from "./IdentityServiceClient";

/**
 * Convert a Matrix session minted by the identity-service into the credentials shape
 * element-web's {@link module:Lifecycle#setLoggedIn} expects. The onboarding flow passes
 * these up through `onLoggedIn`, exactly like the password login, so all downstream
 * crypto/session setup runs identically.
 */
export function credsFromIdentitySession(session: IdentityServiceMatrixSession): IMatrixClientCreds {
    return {
        homeserverUrl: session.baseUrl,
        userId: session.userId,
        deviceId: session.deviceId,
        accessToken: session.accessToken,
        guest: false,
        freshLogin: true,
    };
}

/** Device metadata sent to the identity-service alongside OTP verification. */
export function currentDeviceInfo(): IdentityServiceDeviceInfo {
    return {
        name: SdkConfig.get("brand") ?? "Gua Web",
        platform: "Web",
        appVersion: process.env.VERSION,
    };
}
