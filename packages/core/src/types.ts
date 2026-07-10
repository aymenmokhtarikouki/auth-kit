/**
 * Identity types and seams. `P` = the app's user-profile payload (yuma:
 * firstName/lastName/isConsumer…; lineo: name/role…) — the kit carries it
 * through registration untouched. `C` = extra JWT claims (lineo: role,
 * activeSalonId…). Addresses/avatars/etc. are NOT identity — they live in
 * the app (or @authkit/addresses) and compose via hooks.
 */

export interface AuthUser<P = unknown> {
  id: string
  email: string | null
  phone: string | null
  profile: P
}

/** A verified external identity (Google, Apple, …). */
export interface ProviderIdentity {
  provider: string
  /** Provider's stable user id (`sub`). */
  subject: string
  email?: string | null
  emailVerified?: boolean
  name?: string | null
}

/** Verifies a provider ID token and returns the identity. See providers.ts. */
export interface IdTokenVerifier {
  verify(idToken: string): Promise<ProviderIdentity>
}

export interface UserStore<P = unknown> {
  findById(id: string): Promise<AuthUser<P> | null>
  findByEmail(email: string): Promise<AuthUser<P> | null>
  findByPhone(phone: string): Promise<AuthUser<P> | null>
  findByProvider(provider: string, subject: string): Promise<AuthUser<P> | null>
  create(data: {
    email?: string | null
    phone?: string | null
    profile?: P
  }): Promise<AuthUser<P>>
  linkProvider(userId: string, provider: string, subject: string): Promise<void>
  /** Optional — enables the OTP-verified changeContact flow. */
  updateContact?(userId: string, patch: { email?: string; phone?: string }): Promise<AuthUser<P>>
  /** Optional — enables password login (legacy/lineo compat; OTP is the primary flow). */
  getPasswordHash?(userId: string): Promise<string | null>
  setPasswordHash?(userId: string, hash: string): Promise<void>
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/**
 * Rotating strategy (yuma): every refresh revokes the used token and issues a
 * new pair; multiple devices = multiple live tokens. Store tracks jti values.
 */
export interface RotatingSessionStore {
  add(userId: string, jti: string, expiresAt: Date): Promise<void>
  isActive(jti: string): Promise<boolean>
  revoke(jti: string): Promise<void>
  revokeAllForUser?(userId: string): Promise<void>
}

/**
 * Static strategy (lineo): ONE refresh token per user stored as-is; refresh
 * returns a new access token but the SAME refresh token (deliberately no
 * rotation — avoids the desync window on flaky mobile networks).
 */
export interface StaticSessionStore {
  set(userId: string, token: string | null): Promise<void>
  get(userId: string): Promise<string | null>
}

export type SessionStrategy =
  | { mode: 'rotating'; store: RotatingSessionStore }
  | { mode: 'static'; store: StaticSessionStore }

// ── Tokens ───────────────────────────────────────────────────────────────────

export interface TokenOptions {
  accessSecret: string
  refreshSecret: string
  /** Access token lifetime. Default 900 (15 min). */
  accessTtlSeconds?: number
  /** Refresh token lifetime. Default 180 days. */
  refreshTtlSeconds?: number
  /** Optional `iss` claim baked into + required from every token. */
  issuer?: string
}

/** The session payload returned by every sign-in flow. */
export interface AuthSession<P = unknown> {
  user: AuthUser<P>
  token: string
  refreshToken: string
  /** Access-token TTL, for client-side scheduling. */
  expiresInSeconds: number
  isNewUser: boolean
}

// ── Errors ───────────────────────────────────────────────────────────────────

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'SESSION_REVOKED'
  | 'CONTACT_TAKEN'
  | 'USER_NOT_FOUND'
  | 'PROVIDER_ERROR'
  | 'NOT_SUPPORTED'

export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly status: number
  constructor(code: AuthErrorCode, status: number, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.status = status
  }
}
