/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SdkConfig from "../SdkConfig";

/**
 * A Matrix session minted by the Gua identity-service after a successful OTP verification.
 * Mirrors the iOS `IdentityServiceMatrixSession`.
 */
export interface IdentityServiceMatrixSession {
    accessToken: string;
    userId: string;
    deviceId: string;
    baseUrl: string;
}

/**
 * Result of {@link IdentityServiceClient#verifyOTP}. Existing users without two-step
 * verification receive a Matrix session immediately; brand-new users receive a
 * `signupToken` to pass to `completeSignup`; returning users with two-step verification
 * enabled receive a `pinChallengeToken` to redeem at `verifyPinChallenge`.
 */
export type IdentityServiceVerifyOutcome =
    | { kind: "existingUser"; session: IdentityServiceMatrixSession }
    | { kind: "newUser"; signupToken: string }
    | { kind: "pinRequired"; challengeToken: string };

/** Result of a real-time `/signup/check-username` query. */
export type UsernameAvailability = { kind: "available" } | { kind: "taken" } | { kind: "invalid"; reason?: string };

/** Ephemeral credentials minted for the Matrix `m.login.password` UIA stage during resetIdentity. */
export interface IdentityResetCredentials {
    userId: string;
    password: string;
}

/** Minimal device metadata sent alongside an OTP verification request. */
export interface IdentityServiceDeviceInfo {
    name?: string;
    platform?: string;
    appVersion?: string;
}

export type IdentityServiceErrorCode =
    | "notConfigured"
    | "invalidURL"
    | "rateLimited"
    | "invalidOTP"
    | "invalidPin"
    | "pinLocked"
    | "pinChangeCooldown"
    | "pinChangeChallengeInvalid"
    | "pinChallengeExpired"
    | "invalidSignupToken"
    | "invalidUsername"
    | "usernameTaken"
    | "phoneAlreadyLinked"
    | "invalidReauthToken"
    | "server"
    | "transport"
    | "decoding";

/**
 * Typed error raised by {@link IdentityServiceClient}. Screens map `code` to a localised
 * message; `message` carries an English fallback. Mirrors the iOS `IdentityServiceError`.
 */
export class IdentityServiceError extends Error {
    public readonly code: IdentityServiceErrorCode;
    public readonly status?: number;
    public readonly retryAfterSeconds?: number;
    public readonly cause?: unknown;

    public constructor(
        code: IdentityServiceErrorCode,
        opts: { message?: string; status?: number; retryAfterSeconds?: number; cause?: unknown } = {},
    ) {
        super(opts.message ?? code);
        this.name = "IdentityServiceError";
        this.code = code;
        this.status = opts.status;
        this.retryAfterSeconds = opts.retryAfterSeconds;
        this.cause = opts.cause;
    }
}

/** Shape of an identity-service error body. */
interface ErrorBody {
    code?: string;
    message?: string;
    error?: string;
    error_description?: string;
}

/** Raw verify/session response shared by `/otp/verify`, `/signup/complete`, `/signin/verify-pin`. */
interface VerifyResponse {
    accessToken?: string;
    userId?: string;
    deviceId?: string;
    baseUrl?: string;
    isNewUser?: boolean;
    signupToken?: string;
    pinRequired?: boolean;
    pinChallengeToken?: string;
}

const SUCCESS_STATUSES = new Set([200, 202, 204]);

/**
 * Browser client for the Gua identity-service REST API. Drives the phone/OTP/PIN/profile
 * onboarding and account-security flows and returns Matrix sessions that are handed to
 * {@link module:Lifecycle#setLoggedIn}. Faithful port of the iOS `IdentityServiceClient`.
 */
export default class IdentityServiceClient {
    public constructor(private readonly baseUrl: string) {}

    /** Build a client from `identity_service.base_url` in the app config, or `null` if unset. */
    public static fromConfig(): IdentityServiceClient | null {
        const base = SdkConfig.get("identity_service")?.base_url;
        if (!base) return null;
        return new IdentityServiceClient(base.replace(/\/+$/, ""));
    }

    // MARK: - Onboarding

    public async sendOTP(phone: string, language?: string): Promise<void> {
        await this.postExpectingEmpty("/otp/send", { phone, language });
    }

    public async verifyOTP(
        phone: string,
        code: string,
        pin?: string,
        device?: IdentityServiceDeviceInfo,
    ): Promise<IdentityServiceVerifyOutcome> {
        const response = await this.post<VerifyResponse>("/otp/verify", { phone, code, pin, device });
        if (response.isNewUser === true && response.signupToken) {
            return { kind: "newUser", signupToken: response.signupToken };
        }
        if (response.pinRequired === true && response.pinChallengeToken) {
            return { kind: "pinRequired", challengeToken: response.pinChallengeToken };
        }
        return { kind: "existingUser", session: this.requireSession(response, "verify") };
    }

    public async completeSignup(
        signupToken: string,
        username: string,
        displayName: string,
        pin?: string,
        device?: IdentityServiceDeviceInfo,
    ): Promise<IdentityServiceMatrixSession> {
        const response = await this.post<VerifyResponse>("/signup/complete", {
            signupToken,
            username,
            displayName,
            pin,
            device,
        });
        return this.requireSession(response, "signup");
    }

    public async verifyPinChallenge(
        pinChallengeToken: string,
        pin: string,
        device?: IdentityServiceDeviceInfo,
    ): Promise<IdentityServiceMatrixSession> {
        const response = await this.post<VerifyResponse>("/signin/verify-pin", {
            pinChallengeToken,
            pin,
            device,
        });
        return this.requireSession(response, "verify-pin");
    }

    public async checkUsernameAvailability(username: string): Promise<UsernameAvailability> {
        const trimmed = username.trim();
        if (!trimmed) return { kind: "invalid" };

        const url = new URL(this.resolve("/signup/check-username"));
        url.searchParams.set("username", trimmed);

        let response: Response;
        try {
            response = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
        } catch (error) {
            throw new IdentityServiceError("transport", { cause: error });
        }

        if (response.status === 200) {
            const body = await this.parseJson<{ available: boolean }>(response);
            return body.available ? { kind: "available" } : { kind: "taken" };
        }
        if (response.status === 400) {
            const body = await this.tryParseError(response);
            return { kind: "invalid", reason: body?.message };
        }
        throw new IdentityServiceError("server", { status: response.status });
    }

    // MARK: - Account reauthentication

    public async startAccountReauth(accessToken: string, language?: string): Promise<void> {
        await this.sendAuthenticated("/account/reauth/start", accessToken, {}, { language, expectsBody: false });
    }

    public async verifyAccountReauth(accessToken: string, code: string): Promise<string> {
        const data = await this.sendAuthenticated<{ reauthToken: string; expiresInSeconds: number }>(
            "/account/reauth/verify",
            accessToken,
            { code },
            { expectsBody: true },
        );
        return data.reauthToken;
    }

    public async deactivateAccount(accessToken: string, reauthToken: string, eraseData: boolean): Promise<void> {
        await this.sendAuthenticated(
            "/account/deactivate",
            accessToken,
            { reauthToken, eraseData },
            { expectsBody: false },
        );
    }

    public async resetIdentityCredentials(accessToken: string, reauthToken: string): Promise<IdentityResetCredentials> {
        const data = await this.sendAuthenticated<{ userId: string; password: string }>(
            "/account/reset-identity-credentials",
            accessToken,
            { reauthToken },
            { expectsBody: true },
        );
        return { userId: data.userId, password: data.password };
    }

    public async changeNumber(
        accessToken: string,
        userId: string,
        newPhone: string,
        code: string,
        pin: string,
    ): Promise<void> {
        await this.sendAuthenticated(
            "/otp/change-number",
            accessToken,
            { userId, newPhone, code, pin },
            { expectsBody: false },
        );
    }

    // MARK: - Two-step verification (PIN)

    public async pinStatus(accessToken: string): Promise<boolean> {
        let response: Response;
        try {
            response = await fetch(this.resolve("/security/pin/status"), {
                method: "GET",
                headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
            });
        } catch (error) {
            throw new IdentityServiceError("transport", { cause: error });
        }
        if (response.status !== 200) {
            const body = await this.tryParseError(response);
            throw new IdentityServiceError("server", {
                status: response.status,
                message: body?.message ?? body?.error,
            });
        }
        const data = await this.parseJson<{ hasPin: boolean }>(response);
        return data.hasPin;
    }

    public async setInitialPin(accessToken: string, userId: string, newPin: string): Promise<void> {
        await this.sendAuthenticated("/security/pin", accessToken, { userId, newPin }, { expectsBody: false });
    }

    public async startPinChange(accessToken: string, phone: string, currentPin: string): Promise<string> {
        const data = await this.sendAuthenticated<{ challengeId: string; expiresInSeconds?: number }>(
            "/security/pin/change/start",
            accessToken,
            { phone, currentPin },
            { expectsBody: true },
        );
        return data.challengeId;
    }

    public async completePinChange(
        accessToken: string,
        challengeId: string,
        otpCode: string,
        newPin: string,
    ): Promise<void> {
        await this.sendAuthenticated(
            "/security/pin/change/complete",
            accessToken,
            { challengeId, otpCode, newPin },
            { expectsBody: false },
        );
    }

    public async requestPinReset(userId: string, phone: string): Promise<void> {
        await this.postExpectingEmpty("/security/pin/reset", { userId, phone });
    }

    public async completePinReset(userId: string, phone: string, code: string, newPin: string): Promise<void> {
        await this.postExpectingEmpty("/security/pin/reset/complete", { userId, phone, code, newPin });
    }

    // MARK: - Private

    private requireSession(response: VerifyResponse, context: string): IdentityServiceMatrixSession {
        const { accessToken, userId, deviceId, baseUrl } = response;
        if (!accessToken || !userId || !deviceId || !baseUrl) {
            throw new IdentityServiceError("server", {
                status: 200,
                message: `Malformed ${context} response from server.`,
            });
        }
        return { accessToken, userId, deviceId, baseUrl };
    }

    private resolve(path: string): string {
        return `${this.baseUrl}${path}`;
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        const response = await this.sendRequest(path, body, true);
        return this.parseJson<T>(response);
    }

    private async postExpectingEmpty(path: string, body: unknown): Promise<void> {
        await this.sendRequest(path, body, false);
    }

    private async sendRequest(path: string, body: unknown, expectsBody: boolean): Promise<Response> {
        let response: Response;
        try {
            response = await fetch(this.resolve(path), {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(body ?? {}),
            });
        } catch (error) {
            throw new IdentityServiceError("transport", { cause: error });
        }
        await this.throwForStatus(response);
        return response;
    }

    private async sendAuthenticated<T = void>(
        path: string,
        accessToken: string,
        body: unknown,
        opts: { language?: string; expectsBody: boolean },
    ): Promise<T> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        };
        if (opts.language) headers["Accept-Language"] = opts.language;

        let response: Response;
        try {
            response = await fetch(this.resolve(path), { method: "POST", headers, body: JSON.stringify(body ?? {}) });
        } catch (error) {
            throw new IdentityServiceError("transport", { cause: error });
        }
        await this.throwForStatus(response);
        if (!opts.expectsBody) return undefined as T;
        return this.parseJson<T>(response);
    }

    private async parseJson<T>(response: Response): Promise<T> {
        try {
            return (await response.json()) as T;
        } catch (error) {
            throw new IdentityServiceError("decoding", { cause: error });
        }
    }

    private async tryParseError(response: Response): Promise<ErrorBody | undefined> {
        try {
            return (await response.clone().json()) as ErrorBody;
        } catch {
            return undefined;
        }
    }

    /**
     * Map identity-service HTTP statuses to typed errors. Mirrors the iOS status→error table
     * so both clients surface identical semantics for rate limits, lockouts and cooldowns.
     */
    private async throwForStatus(response: Response): Promise<void> {
        if (SUCCESS_STATUSES.has(response.status)) return;

        const body = await this.tryParseError(response);
        const retryAfter = parseInt(response.headers.get("Retry-After") ?? "", 10);
        const retryAfterSeconds = Number.isFinite(retryAfter) ? retryAfter : undefined;

        switch (response.status) {
            case 400:
                if (body?.code === "invalid_username") {
                    throw new IdentityServiceError("invalidUsername", { message: body.message });
                }
                if (body?.code === "invalid_otp") throw new IdentityServiceError("invalidOTP");
                if (body?.code === "invalid_pin") throw new IdentityServiceError("invalidPin");
                throw new IdentityServiceError("server", { status: 400, message: body?.message ?? body?.error });
            case 401:
                if (body?.code === "invalid_signup_token") throw new IdentityServiceError("invalidSignupToken");
                if (body?.code === "invalid_pin_challenge") throw new IdentityServiceError("pinChallengeExpired");
                throw new IdentityServiceError("invalidOTP");
            case 403:
                throw new IdentityServiceError("invalidPin");
            case 409:
                if (body?.code === "username_taken") throw new IdentityServiceError("usernameTaken");
                if (body?.code === "phone_already_linked") throw new IdentityServiceError("phoneAlreadyLinked");
                throw new IdentityServiceError("server", { status: 409, message: body?.message ?? body?.error });
            case 425:
                if (body?.code === "pin_change_cooldown") {
                    throw new IdentityServiceError("pinChangeCooldown", { retryAfterSeconds });
                }
                throw new IdentityServiceError("server", { status: 425, message: body?.message ?? body?.error });
            case 429:
                if (body?.code === "pin_locked") throw new IdentityServiceError("pinLocked", { retryAfterSeconds });
                throw new IdentityServiceError("rateLimited");
            default:
                throw new IdentityServiceError("server", {
                    status: response.status,
                    message: body?.message ?? body?.error_description ?? body?.error,
                });
        }
    }
}
