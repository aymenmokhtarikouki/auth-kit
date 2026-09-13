/**
 * Identity types and seams. `P` = the app's user-profile payload (e.g.
 * firstName/lastName or name/role) — the kit carries it
 * through registration untouched. `C` = extra JWT claims (e.g. role,
 * activeTenantId). Addresses/avatars/etc. are NOT identity — they live in
 * the app (or @aymenkits/location-addresses) and compose via hooks.
 */
export interface AuthUser<P = unknown> {
    id: string;
    email: string | null;
    phone: string | null;
    profile: P;
}
/** A verified external identity (Google, Apple, …). */
export interface ProviderIdentity {
    provider: string;
    /** Provider's stable user id (`sub`). */
    subject: string;
    email?: string | null;
    emailVerified?: boolean;
    name?: string | null;
}
/** Verifies a provider ID token and returns the identity. See providers.ts. */
export interface IdTokenVerifier {
    verify(idToken: string): Promise<ProviderIdentity>;
}
export interface UserStore<P = unknown> {
    findById(id: string): Promise<AuthUser<P> | null>;
    findByEmail(email: string): Promise<AuthUser<P> | null>;
    findByPhone(phone: string): Promise<AuthUser<P> | null>;
    findByProvider(provider: string, subject: string): Promise<AuthUser<P> | null>;
    create(data: {
        email?: string | null;
        phone?: string | null;
        profile?: P;
    }): Promise<AuthUser<P>>;
    linkProvider(userId: string, provider: string, subject: string): Promise<void>;
    /** Optional — enables the OTP-verified changeContact flow. */
    updateContact?(userId: string, patch: {
        email?: string;
        phone?: string;
    }): Promise<AuthUser<P>>;
    /** Optional — enables password login (legacy compatibility; OTP is the primary flow). */
    getPasswordHash?(userId: string): Promise<string | null>;
    setPasswordHash?(userId: string, hash: string): Promise<void>;
}
/**
 * Rotating strategy: every refresh revokes the used token and issues a
 * new pair; multiple devices = multiple live tokens. Store tracks jti values.
 */
export interface RotatingSessionStore {
    add(userId: string, jti: string, expiresAt: Date): Promise<void>;
    isActive(jti: string): Promise<boolean>;
    revoke(jti: string): Promise<void>;
    /**
     * Kill the whole session family. Called on refresh-token REPLAY: a
     * validly-signed token that is no longer active was already rotated or
     * revoked — someone is holding a stolen copy, so every session dies.
     */
    revokeAllForUser(userId: string): Promise<void>;
}
/**
 * Static strategy: ONE refresh token per user stored as-is; refresh
 * returns a new access token but the SAME refresh token (deliberately no
 * rotation — avoids the desync window on flaky mobile networks).
 */
export interface StaticSessionStore {
    set(userId: string, token: string | null): Promise<void>;
    get(userId: string): Promise<string | null>;
}
/**
 * How far a refresh-token REPLAY reaches when it is detected.
 *
 * A validly-signed refresh token whose jti is no longer active was already
 * rotated out, so a copy of it is in circulation. The safe reading is that the
 * copy is stolen, and `'user'` — the default, and the only behaviour before
 * this option existed — kills every session that user has, on every device.
 *
 * That is right for a real deployment and wrong for a FLEET: several instances
 * legitimately signed in to one account will race on refresh, and one loser's
 * stale replay then signs out every other instance AND the human's own
 * machine. Measured on katharina's test fleet (2026-08-27): five independently
 * signed-in app instances, four sessions dead within minutes, the survivor
 * being whichever signed in last.
 *
 * `'session'` narrows the response to the replayed session alone: that jti is
 * revoked and the request is refused, while sibling sessions live on. It is
 * strictly weaker — a genuine thief keeps their other stolen sessions — so it
 * is opt-in, and a deployment that chooses it is saying "concurrent sessions
 * for one account are expected here".
 */
export type ReplayResponse = 'user' | 'session';
export type SessionStrategy = {
    mode: 'rotating';
    store: RotatingSessionStore;
    onReplay?: ReplayResponse;
} | {
    mode: 'static';
    store: StaticSessionStore;
};
export interface TokenOptions {
    accessSecret: string;
    refreshSecret: string;
    /** Access token lifetime. Default 900 (15 min). */
    accessTtlSeconds?: number;
    /** Refresh token lifetime. Default 180 days. */
    refreshTtlSeconds?: number;
    /** Optional `iss` claim baked into + required from every token. */
    issuer?: string;
}
/** The session payload returned by every sign-in flow. */
export interface AuthSession<P = unknown> {
    user: AuthUser<P>;
    token: string;
    refreshToken: string;
    /** Access-token TTL, for client-side scheduling. */
    expiresInSeconds: number;
    isNewUser: boolean;
}
export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'INVALID_TOKEN'
/** Signature valid but past exp — clients should refresh, not logout. */
 | 'TOKEN_EXPIRED' | 'SESSION_REVOKED' | 'CONTACT_TAKEN' | 'USER_NOT_FOUND' | 'PROVIDER_ERROR' | 'NOT_SUPPORTED';
export declare class AuthError extends Error {
    readonly code: AuthErrorCode;
    readonly status: number;
    constructor(code: AuthErrorCode, status: number, message: string);
}
//# sourceMappingURL=types.d.ts.map