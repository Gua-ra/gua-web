/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { Crypto } from "@peculiar/webcrypto";
import fetchMock from "fetch-mock-jest";
import { getRandomValues } from "node:crypto";

import { startGuaPhoneOidcLogin } from "../../../../src/gua/oidc/startPhoneOidcLogin";
import { mockPlatformPeg } from "../../../test-utils";
import { makeDelegatedAuthConfig } from "../../../test-utils/oidc";

const webCrypto = new Crypto();

describe("startGuaPhoneOidcLogin", () => {
    const issuer = "https://auth.com/";
    const homeserverUrl = "https://matrix.org";
    const identityServerUrl = "https://is.org";
    const clientId = "gua-web";
    const baseUrl = "https://test.com";
    const delegatedAuthConfig = makeDelegatedAuthConfig(issuer);
    const realWindowLocation = window.location;

    beforeAll(() => {
        fetchMock.get(`${delegatedAuthConfig.issuer}.well-known/openid-configuration`, delegatedAuthConfig);
    });

    beforeEach(() => {
        // @ts-ignore allow delete of non-optional prop
        delete window.location;
        // @ts-ignore ugly mocking
        window.location = {
            href: baseUrl,
            origin: baseUrl,
        };

        mockPlatformPeg();
        Object.defineProperty(window, "crypto", {
            value: {
                getRandomValues,
                randomUUID: jest.fn().mockReturnValue("not-random-uuid"),
                subtle: webCrypto.subtle,
            },
        });
    });

    afterAll(() => {
        // @ts-expect-error
        window.location = realWindowLocation;
    });

    it("passes the phone as login_hint without forcing an OIDC prompt", async () => {
        await startGuaPhoneOidcLogin(delegatedAuthConfig, clientId, homeserverUrl, identityServerUrl, "+15551234567");

        const authUrl = new URL(window.location.href);

        expect(authUrl.searchParams.get("login_hint")).toEqual("+15551234567");
        expect(authUrl.searchParams.has("prompt")).toBeFalsy();
    });
});
