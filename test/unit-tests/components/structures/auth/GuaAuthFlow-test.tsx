/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "jest-matrix-react";
import { logger } from "matrix-js-sdk/src/logger";

import GuaAuthFlow from "../../../../../src/components/structures/auth/GuaAuthFlow";
import { startGuaPhoneOidcLogin } from "../../../../../src/gua/oidc/startPhoneOidcLogin";
import { ResolverVerification } from "../../../../../src/gua/resolver/verification/ResolverVerifier";
import SdkConfig from "../../../../../src/SdkConfig";
import AutoDiscoveryUtils from "../../../../../src/utils/AutoDiscoveryUtils";
import * as registerClient from "../../../../../src/utils/oidc/registerClient";
import { mkServerConfig } from "../../../../test-utils";
import { makeDelegatedAuthConfig } from "../../../../test-utils/oidc";

jest.mock("../../../../../src/gua/oidc/startPhoneOidcLogin", () => ({ startGuaPhoneOidcLogin: jest.fn() }));

// jsdom has no SubtleCrypto; the verifier reads globalThis.crypto.subtle exactly as a browser would.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

interface KeyVector {
    id: string;
    publicKeySpkiB64: string;
}

const vectors = JSON.parse(
    readFileSync(
        join(__dirname, "../../../gua/resolver/verification/fixtures/gua-client-verification-v1-vectors.json"),
        "utf8",
    ),
);
const r2 = vectors.rosters.find((r: { ref?: string }) => r.ref === "r2");
const policy = vectors.policies.find((p: { ref?: string }) => p.ref === "br-policy v3");

const RESOLVER = "https://resolver.example";
const br = {
    serverName: "br.gua.test",
    baseUrl: "https://matrix.br.gua.test",
    masIssuer: "https://account.br.gua.test",
};

function configKeys(keys: KeyVector[]): { id: string; public_key: string }[] {
    return keys.map((k) => ({ id: k.id, public_key: k.publicKeySpkiB64 }));
}

function jsonResponse(value: unknown): Response {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
    return { ok: true, status: 200, body, json: async () => value } as unknown as Response;
}

/** The resolver: /resolve answers at once, the signed documents only once `documentsReady` settles. */
function resolverFetch(documentsReady: Promise<void>): jest.Mock {
    return jest.fn(async (url: string) => {
        if (url === `${RESOLVER}/resolve`) return jsonResponse({ exists: false, registerAt: br });
        await documentsReady;
        if (url === `${RESOLVER}/roster`) return jsonResponse(r2.roster);
        if (url === `${RESOLVER}/policy/routing`) return jsonResponse(policy.bundle);
        if (url === `${RESOLVER}/roster/log`) return jsonResponse({ events: vectors.log.events });
        return { ok: false, status: 404, body: null } as unknown as Response;
    });
}

function reportLines(): string[] {
    return jest
        .mocked(logger.info)
        .mock.calls.map(([line]) => line)
        .filter((line): line is string => typeof line === "string" && line.startsWith("Resolver verification"));
}

describe("GuaAuthFlow", () => {
    const realFetch = globalThis.fetch;
    const delegatedAuth = makeDelegatedAuthConfig("https://account.br.gua.test/");

    beforeEach(() => {
        SdkConfig.put({
            brand: "Gua",
            default_country_code: "BR",
            gua_resolver: {
                base_url: RESOLVER,
                verification: {
                    environment: "dev",
                    authority_keys: configKeys(r2.trustedKeys),
                    authority_threshold: r2.threshold,
                    policy_keys: configKeys(policy.trustedKeys),
                },
            },
        });
        jest.spyOn(logger, "info").mockImplementation(() => {});
        jest.spyOn(registerClient, "getOidcClientId").mockResolvedValue("gua-web");
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
        jest.restoreAllMocks();
        jest.mocked(startGuaPhoneOidcLogin).mockReset();
        SdkConfig.reset();
    });

    function renderFlow(): void {
        render(
            <GuaAuthFlow
                onLoggedIn={jest.fn()}
                serverConfig={mkServerConfig("https://matrix.org", "https://vector.im", delegatedAuth)}
            />,
        );
    }

    /** Submits the phone and returns the report lines logged by the time the browser would leave for sign-in. */
    async function signIn(): Promise<string[]> {
        let linesAtRedirect: string[] = [];
        jest.mocked(startGuaPhoneOidcLogin).mockImplementation(async () => {
            linesAtRedirect = reportLines();
        });
        fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "11987654321" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        await waitFor(() => expect(startGuaPhoneOidcLogin).toHaveBeenCalled());
        return linesAtRedirect;
    }

    it("starts verifying the resolver's roster when the phone step opens", async () => {
        globalThis.fetch = resolverFetch(Promise.resolve());
        renderFlow();

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(`${RESOLVER}/roster`, expect.anything()));
    });

    it("prepares the resolver's documents again every minute while the phone step is shown", () => {
        jest.useFakeTimers();
        const prepare = jest.spyOn(ResolverVerification.prototype, "prepare").mockImplementation(() => {});
        try {
            renderFlow();
            expect(prepare).toHaveBeenCalledTimes(1);

            act(() => jest.advanceTimersByTime(60_000));
            expect(prepare).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });

    it("logs the sign-in's report before redirecting, even while the signed documents are still loading", async () => {
        let releaseDocuments = (): void => {};
        globalThis.fetch = resolverFetch(new Promise((resolve) => (releaseDocuments = resolve)));
        jest.spyOn(AutoDiscoveryUtils, "validateServerConfigWithStaticUrls").mockResolvedValue(
            mkServerConfig(br.baseUrl, "https://vector.im", delegatedAuth),
        );
        renderFlow();

        const lines = await signIn();
        releaseDocuments();

        expect(lines).toEqual([expect.stringContaining("rosterSignature=unverifiable(timeout)")]);
    });

    it("reports the documents it verified while the phone was typed, whatever issuer discovery finds", async () => {
        globalThis.fetch = resolverFetch(Promise.resolve());
        const discovered = mkServerConfig(
            br.baseUrl,
            "https://vector.im",
            makeDelegatedAuthConfig("https://account.evil.test/"),
        );
        jest.spyOn(AutoDiscoveryUtils, "validateServerConfigWithStaticUrls").mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve(discovered), 50)),
        );
        renderFlow();
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(`${RESOLVER}/roster/log`, expect.anything()));

        const lines = await signIn();

        // jsdom has no Web Locks, so the pin is left alone.
        expect(lines).toEqual([
            expect.stringContaining(
                "rosterSignature=valid homeserverMatch=ACTIVE_MATCH memberEntry=valid " +
                    "logConsistency=unverifiable(storage_unavailable) policy=valid placement=match",
            ),
        ]);
    });
});
