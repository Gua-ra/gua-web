/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type OidcClientConfig } from "matrix-js-sdk/src/matrix";
import { generateOidcAuthorizationUrl } from "matrix-js-sdk/src/oidc/authorize";
import { secureRandomString } from "matrix-js-sdk/src/randomstring";

import PlatformPeg from "../../PlatformPeg";

export async function startGuaPhoneOidcLogin(
    delegatedAuthConfig: OidcClientConfig,
    clientId: string,
    homeserverUrl: string,
    identityServerUrl: string | undefined,
    phoneNumber: string,
): Promise<void> {
    const redirectUri = PlatformPeg.get()!.getOidcCallbackUrl().href;
    const nonce = secureRandomString(10);
    const authorizationUrl = await generateOidcAuthorizationUrl({
        metadata: delegatedAuthConfig,
        redirectUri,
        clientId,
        homeserverUrl,
        identityServerUrl,
        nonce,
        urlState: PlatformPeg.get()?.getOidcClientState(),
        loginHint: phoneNumber,
    });

    window.location.href = authorizationUrl;
}
