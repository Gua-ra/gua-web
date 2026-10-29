/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import ResolverClient, { ResolverError } from "../../../../src/gua/resolver/ResolverClient";
import { ParseError } from "../../../../src/gua/resolver/verification/json";

function streamOf(text: string): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

function response(status: number, body?: unknown): Response {
    const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
    return {
        ok: status >= 200 && status < 300,
        status,
        body: streamOf(text),
        json: async () => JSON.parse(text),
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
        jest.restoreAllMocks();
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

        it("reads the roster version the answer was made against", async () => {
            fetchMock.mockResolvedValue(response(200, { exists: false, registerAt: homeserver, rosterVersion: 7 }));
            await expect(client.resolve("+15550000000")).resolves.toEqual({
                exists: false,
                homeserver,
                rosterVersion: 7,
            });
        });

        it("ignores a roster version that is not an integer", async () => {
            fetchMock.mockResolvedValue(response(200, { exists: false, registerAt: homeserver, rosterVersion: "7" }));
            expect((await client.resolve("+15550000000")).rosterVersion).toBeUndefined();
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

        it("rejects a 2xx body that is not JSON as a parse error", async () => {
            fetchMock.mockResolvedValue(response(200, "<html>busy</html>"));
            await expect(client.fetchRoster()).rejects.toThrow(ParseError);
        });

        it("stops reading a body past 2 MiB and never decodes it", async () => {
            const chunk = new Uint8Array(64 * 1024).fill(0x20);
            let served = 0;
            const body = new ReadableStream<Uint8Array>({
                pull(controller) {
                    served += chunk.length;
                    if (served > 3 * 1024 * 1024) controller.close();
                    else controller.enqueue(chunk);
                },
            });
            fetchMock.mockResolvedValue({ ok: true, status: 200, body } as unknown as Response);
            const parse = jest.spyOn(JSON, "parse");

            await expect(client.fetchRoster()).rejects.toThrow(ParseError);
            expect(parse).not.toHaveBeenCalled();
            expect(served).toBeLessThan(2 * 1024 * 1024 + 4 * chunk.length);
        });

        it("refuses a document nested more than 64 levels deep", async () => {
            fetchMock.mockResolvedValue(response(200, "[".repeat(65) + "]".repeat(65)));
            await expect(client.fetchRoster()).rejects.toThrow(ParseError);
        });

        it("accepts a document nested exactly 64 levels deep", async () => {
            fetchMock.mockResolvedValue(response(200, "[".repeat(64) + "]".repeat(64)));
            await expect(client.fetchRoster()).resolves.toBeInstanceOf(Array);
        });

        it("does not count brackets inside strings toward the nesting depth", async () => {
            const text = JSON.stringify({ note: "[".repeat(100) + '\\"{' });
            fetchMock.mockResolvedValue(response(200, text));
            await expect(client.fetchRoster()).resolves.toEqual({ note: "[".repeat(100) + '\\"{' });
        });
    });
});
