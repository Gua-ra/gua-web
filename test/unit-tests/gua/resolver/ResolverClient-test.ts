/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import ResolverClient from "../../../../src/gua/resolver/ResolverClient";

describe("ResolverClient", () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    exists: false,
                    registerAt: { serverName: "register.gua.global", baseUrl: "https://register.gua.global" },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        );
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it("keeps legacy phone-only resolve payloads", async () => {
        const client = new ResolverClient("https://resolver.gua.test");

        await client.resolve("+5511999999999");

        expect(fetchSpy).toHaveBeenCalledWith("https://resolver.gua.test/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ phone: "+5511999999999" }),
        });
    });

    it("sends optional v1 routing fields when provided", async () => {
        const client = new ResolverClient("https://resolver.gua.test");

        await client.resolve("+5511999999999", {
            regionHint: "br-sp",
            affiliations: ["example.edu"],
            attributes: { oidc_issuer: "https://sso.example.edu" },
            trace: true,
            routingClaims: {
                schemaVersion: "gua-routing-claims.v1",
                issuer: "https://sso.example.edu",
                audience: "gua-resolver",
                issuedAt: "2026-07-04T12:00:00Z",
                expiresAt: "2026-07-04T12:05:00Z",
                nonce: "nonce-123",
                affiliations: ["example.edu"],
                attributes: { institution_domain: "example.edu" },
                signatures: [{ keyId: "sso-key-1", signatureB64: "abc123" }],
            },
        });

        const request = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
        expect(request).toEqual({
            phone: "+5511999999999",
            regionHint: "br-sp",
            affiliations: ["example.edu"],
            attributes: { oidc_issuer: "https://sso.example.edu" },
            trace: true,
            routingClaims: {
                schemaVersion: "gua-routing-claims.v1",
                issuer: "https://sso.example.edu",
                audience: "gua-resolver",
                issuedAt: "2026-07-04T12:00:00Z",
                expiresAt: "2026-07-04T12:05:00Z",
                nonce: "nonce-123",
                affiliations: ["example.edu"],
                attributes: { institution_domain: "example.edu" },
                signatures: [{ keyId: "sso-key-1", signatureB64: "abc123" }],
            },
        });
    });
});
