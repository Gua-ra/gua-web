/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SdkConfig from "../../SdkConfig";
import { readJsonBody } from "./verification/json";

/**
 * A homeserver as advertised by the Gua resolver: where a phone's account lives (login) or should be
 * created (register). Identified by its Matrix `serverName`; the client discovers the full config via
 * well-known, exactly as for any account provider. Mirrors the iOS `ResolvedHomeserver`.
 */
export interface ResolvedHomeserver {
    serverName: string;
    baseUrl: string;
    masIssuer?: string;
    region?: string;
}

/** Outcome of resolving a phone number against the Gua resolver. */
export interface HomeserverResolution {
    exists?: boolean;
    /** The homeserver to authenticate against (login) or create the account on (register). */
    homeserver: ResolvedHomeserver;
    rosterVersion?: number;
}

/** What fetchRoutingPolicy returns for a 404, so that a body of null is not mistaken for one. */
export const NOT_FOUND = Symbol("not found");

export class ResolverError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "ResolverError";
    }
}

/**
 * Browser client for the Gua resolver (`POST /resolve`) — the federation front door that maps a phone
 * number to a homeserver, so the client never hardcodes one. Faithful port of the iOS `ResolverClient`.
 */
export default class ResolverClient {
    public constructor(public readonly baseUrl: string) {}

    /** Build a client from `gua_resolver.base_url` in the app config, or `null` if unset. */
    public static fromConfig(): ResolverClient | null {
        const base = SdkConfig.get("gua_resolver")?.base_url;
        if (!base) return null;
        return new ResolverClient(base.replace(/\/+$/, ""));
    }

    /** Resolve a verified phone number to the homeserver it belongs to (or should be created on). */
    public async resolve(phoneNumber: string): Promise<HomeserverResolution> {
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/resolve`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ phone: phoneNumber }),
            });
        } catch (e) {
            throw new ResolverError(`Could not reach the routing service: ${String(e)}`);
        }
        if (!response.ok) {
            throw new ResolverError(`Routing service error (${response.status}).`);
        }

        let body: {
            exists?: boolean;
            homeserver?: ResolvedHomeserver | null;
            registerAt?: ResolvedHomeserver | null;
            rosterVersion?: unknown;
        };
        try {
            body = await response.json();
        } catch (e) {
            throw new ResolverError(`Could not parse the routing service response: ${String(e)}`);
        }
        const ref = body.homeserver ?? body.registerAt;
        if (!ref) {
            throw new ResolverError("The routing service returned an unexpected response.");
        }
        const rosterVersion = Number.isSafeInteger(body.rosterVersion) ? (body.rosterVersion as number) : undefined;
        return { exists: body.exists, homeserver: ref, rosterVersion };
    }

    public fetchRoster(signal?: AbortSignal): Promise<unknown> {
        return this.getJson("/roster", signal);
    }

    public fetchLog(signal?: AbortSignal): Promise<unknown> {
        return this.getJson("/roster/log", signal);
    }

    public fetchConsistency(first: number, second: number, signal?: AbortSignal): Promise<unknown> {
        return this.getJson(`/roster/log/consistency?first=${first}&second=${second}`, signal);
    }

    public fetchRoutingPolicy(signal?: AbortSignal): Promise<unknown> {
        return this.getJson("/policy/routing", signal, true);
    }

    /** A body that is too large, nested too deeply or not JSON rejects with the verifier's ParseError. */
    private async getJson(path: string, signal?: AbortSignal, allowNotFound = false): Promise<unknown> {
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, { headers: { Accept: "application/json" }, signal });
        } catch (e) {
            throw new ResolverError(`Could not reach the routing service: ${String(e)}`);
        }
        if (allowNotFound && response.status === 404) return NOT_FOUND;
        if (!response.ok) {
            throw new ResolverError(`Routing service error (${response.status}).`);
        }
        return readJsonBody(response.body);
    }
}
