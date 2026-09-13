/**
 * @aymenkits/auth-express — HTTP adapter for @aymenkits/auth-core.
 *
 * Structurally typed (no @types/express dependency) so it works on Express 4
 * and Express 5. Envelope-agnostic: pass `wrapResponse` to
 * apply your app's convention (e.g. createApiResponse).
 *
 * Quick start:
 *   const { requireAuth } = createAuthMiddleware(auth)
 *   const handlers = createAuthHandlers(auth, { wrapResponse: (d) => ({ data: d }) })
 *   router.post('/auth/otp/request', handlers.otpRequest)
 *   router.post('/auth/otp/verify', handlers.otpVerify)
 *   router.get('/users/me', requireAuth, myMeController)
 */
import type { AuthService } from '@aymenkits/auth-core';
export interface MinimalRequest {
    headers: Record<string, unknown>;
    body?: unknown;
    /** Populated by requireAuth / optionalAuth. */
    auth?: {
        userId: string;
        claims: Record<string, unknown>;
    };
}
export interface MinimalResponse {
    status(code: number): MinimalResponse;
    json(body: unknown): unknown;
}
export type NextFn = (err?: unknown) => void;
type Handler = (req: MinimalRequest, res: MinimalResponse, next?: NextFn) => void | Promise<void>;
/** Map kit errors to HTTP; unknown errors → 500 (or forward with onError:'next'). */
export declare function sendKitError(res: MinimalResponse, err: unknown): void;
export interface AuthMiddleware {
    /** 401 unless a valid Bearer token is present; attaches req.auth. */
    requireAuth: Handler;
    /** Attaches req.auth when a valid token is present; never blocks. */
    optionalAuth: Handler;
    /** 403 unless the claims satisfy the predicate (compose after requireAuth). */
    requireClaims(predicate: (claims: Record<string, unknown>) => boolean, message?: string): Handler;
}
export declare function createAuthMiddleware(auth: Pick<AuthService<unknown, Record<string, unknown>>, 'verifyAccess'>): AuthMiddleware;
export interface AuthHandlersOptions {
    /** Wrap successful payloads in your app's envelope. */
    wrapResponse?: (data: unknown) => unknown;
    /** 'respond' (default) sends kit errors; 'next' forwards to your error middleware. */
    onError?: 'respond' | 'next';
}
export declare function createAuthHandlers<P>(auth: AuthService<P, Record<string, unknown>>, options?: AuthHandlersOptions): {
    /** POST { channel, destination } */
    otpRequest: Handler;
    /** POST { channel, destination, code, profile? } → session */
    otpVerify: Handler;
    /** POST { provider, idToken, profile? } → session (google/apple/…) */
    providerSignIn: Handler;
    /** POST { refreshToken } → new pair (rotating) / new access (static) */
    refresh: Handler;
    /** POST { refreshToken } — always 200 (logout is best-effort). */
    logout: Handler;
    /** POST { channel, destination } — authed; code goes to the NEW destination. */
    contactChangeRequest: Handler;
    /** POST { channel, destination, code } — authed; writes the verified contact. */
    contactChangeConfirm: Handler;
};
export {};
//# sourceMappingURL=index.d.ts.map