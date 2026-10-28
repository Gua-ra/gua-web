/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import ResolverClient, { ResolverError } from "../../../../src/gua/resolver/ResolverClient";

function response(status: number, body?: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            if (body === undefined) throw new SyntaxError("no body");
            return body;
        },
    } as unknown as Response;
}

describe("ResolverClient", () => {
    const realFetch = globalThis.fetch;
    const client = new ResolverClient("https://resolver.example");
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn();
        globalThis.fetch = fetchMock;
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    describe("resolve", () => {
        const homeserver = { serverName: "gua.test", baseUrl: "https://matrix.gua.test" };

        it("returns the homeserver for an existing account", async () => {
            fetchMock.mockResolvedValue(response(200, { exists: true, homeserver }));
            await expect(client.resolve("+15550000000")).resolves.toEqual({ exists: true, homeserver });
        });

        it("returns registerAt for a new account", async () => {
            fetchMock.mockResolvedValue(response(200, { exists: false, registerAt: homeserver }));
            await expect(client.resolve("+15550000000")).resolves.toEqual({ exists: false, homeserver });
        });

        it("accepts the uniform answer that carries no exists flag", async () => {
            fetchMock.mockResolvedValue(response(200, { registerAt: homeserver }));
            await expect(client.resolve("+15550000000")).resolves.toEqual({ exists: undefined, homeserver });
        });
    });

    describe("anonymous document reads", () => {
        it("fetches the roster as served", async () => {
            fetchMock.mockResolvedValue(response(200, { version: 1 }));
            await expect(client.fetchRoster()).resolves.toEqual({ version: 1 });
            expect(fetchMock).toHaveBeenCalledWith(
                "https://resolver.example/roster",
                expect.objectContaining({ headers: { Accept: "application/json" } }),
            );
        });

        it("asks for the consistency proof between the pinned and the served size", async () => {
            fetchMock.mockResolvedValue(response(200, { first: 3, second: 7, proof: [] }));
            await client.fetchConsistency(3, 7);
            expect(fetchMock.mock.calls[0][0]).toBe("https://resolver.example/roster/log/consistency?first=3&second=7");
        });

        it("reads a 404 on the routing policy as no policy", async () => {
            fetchMock.mockResolvedValue(response(404));
            await expect(client.fetchRoutingPolicy()).resolves.toBeNull();
        });

        it("fails on any other non-2xx status", async () => {
            fetchMock.mockResolvedValue(response(404));
            await expect(client.fetchLog()).rejects.toThrow(ResolverError);
            fetchMock.mockResolvedValue(response(503));
            await expect(client.fetchRoutingPolicy()).rejects.toThrow(ResolverError);
        });

        it("fails when the browser refuses the request", async () => {
            fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
            await expect(client.fetchRoster()).rejects.toThrow(ResolverError);
        });

        it("fails when the body is not JSON", async () => {
            fetchMock.mockResolvedValue(response(200));
            await expect(client.fetchRoster()).rejects.toThrow(ResolverError);
        });
    });
});
