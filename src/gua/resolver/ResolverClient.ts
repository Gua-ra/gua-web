/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SdkConfig from "../../SdkConfig";

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
    /** `true` when an account already exists for this phone (→ login); `false` when not (→ register). */
    exists: boolean;
    /** The homeserver to authenticate against (login) or create the account on (register). */
    homeserver: ResolvedHomeserver;
    /** Optional decision metadata requested with `trace: true`; do not display to end users. */
    trace?: ResolverDecisionTrace;
}

export interface ResolverResolveOptions {
    country?: string;
    mccmnc?: string;
    carrier?: string;
    regionHint?: string;
    affiliations?: string[];
    attributes?: Record<string, string>;
    routingClaims?: ResolverRoutingClaimsEnvelope;
    trace?: boolean;
}

export interface ResolverRoutingClaimsEnvelope {
    schemaVersion: string;
    issuer: string;
    audience: string;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
    affiliations?: string[];
    attributes?: Record<string, string>;
    signatures: ResolverClaimSignature[];
}

export interface ResolverClaimSignature {
    keyId: string;
    signatureB64: string;
}

export interface ResolverDecisionTrace {
    source: string;
    rule: string;
    ruleId?: string;
    reason?: string;
    policyId?: string;
    policyVersion?: number;
    delegatedZoneId?: string;
    assignmentPolicy?: string;
    homeserverId?: string;
}

interface ResolveRequest extends ResolverResolveOptions {
    phone: string;
}

interface ResolveResponse {
    exists: boolean;
    homeserver?: ResolvedHomeserver;
    registerAt?: ResolvedHomeserver;
    trace?: ResolverDecisionTrace;
}

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
    public constructor(private readonly baseUrl: string) {}

    /** Build a client from `gua_resolver.base_url` in the app config, or `null` if unset. */
    public static fromConfig(): ResolverClient | null {
        const base = SdkConfig.get("gua_resolver")?.base_url;
        if (!base) return null;
        return new ResolverClient(base.replace(/\/+$/, ""));
    }

    /** Resolve a verified phone number to the homeserver it belongs to (or should be created on). */
    public async resolve(phoneNumber: string, options: ResolverResolveOptions = {}): Promise<HomeserverResolution> {
        const requestBody: ResolveRequest = { phone: phoneNumber, ...options };
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/resolve`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(requestBody),
            });
        } catch (e) {
            throw new ResolverError(`Could not reach the routing service: ${String(e)}`);
        }
        if (!response.ok) {
            throw new ResolverError(`Routing service error (${response.status}).`);
        }

        let body: ResolveResponse;
        try {
            body = await response.json();
        } catch (e) {
            throw new ResolverError(`Could not parse the routing service response: ${String(e)}`);
        }
        const ref = body.exists ? body.homeserver : body.registerAt;
        if (!ref) {
            throw new ResolverError("The routing service returned an unexpected response.");
        }
        return { exists: body.exists, homeserver: ref, trace: body.trace };
    }
}
