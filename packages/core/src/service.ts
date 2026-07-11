/**
 * The auth flows. OTP-FIRST: email/phone codes are the primary login AND
 * registration (verify = find-or-create — the production flow this kit was extracted from).
 * Google/Apple sign in via verified ID tokens with account linking.
 * Passwords are optional (legacy compatibility) — no flow requires one.
 */
import bcrypt from 'bcryptjs'
import type { OtpChannel, OtpService } from '@aymenkits/auth-otp'
import type {
  AuthSession,
  AuthUser,
  IdTokenVerifier,
  SessionStrategy,
  TokenOptions,
  UserStore,
} from './types'
import { AuthError } from './types'
import { createTokenService } from './tokens'

export interface AuthHooks<P> {
  /** After a brand-new user row is created (any flow). Attach app follow-ups here. */
  onUserCreated?: (user: AuthUser<P>, context: { flow: string }) => void | Promise<void>
  /** After every successful sign-in (audit trails, last-login stamps). */
  onLogin?: (user: AuthUser<P>, context: { flow: string }) => void | Promise<void>
}

export interface CreateAuthServiceArgs<P, C extends object> {
  users: UserStore<P>
  session: SessionStrategy
  tokens: TokenOptions
  /** Wire an @aymenkits/auth-otp service to enable OTP login + contact change. */
  otp?: OtpService
  /** ID-token verifiers by provider name ('google', 'apple', …). */
  providers?: Record<string, IdTokenVerifier>
  /** Extra JWT claims derived from the user (role, activeSalonId, …). */
  claims?: (user: AuthUser<P>) => C
  hooks?: AuthHooks<P>
  /** bcrypt cost for passwords. Default 12. */
  passwordHashRounds?: number
}

export interface AuthService<P = unknown, C extends object = Record<string, never>> {
  // OTP-first login/registration
  requestOtp(channel: OtpChannel, destination: string): Promise<{ expiresInSeconds: number; sent: boolean }>
  verifyOtp(input: {
    channel: OtpChannel
    destination: string
    code: string
    /** Profile for first-time users (names, role, …). Ignored for existing users. */
    profile?: P
  }): Promise<AuthSession<P>>

  // Provider sign-in (Google / Apple / anything with an IdTokenVerifier)
  signInWithProvider(provider: string, idToken: string, profile?: P): Promise<AuthSession<P>>

  // Optional password flows (legacy compat)
  loginWithPassword(email: string, password: string): Promise<AuthSession<P>>
  registerWithPassword(input: { email: string; password: string; profile?: P }): Promise<AuthSession<P>>

  // Sessions
  refresh(refreshToken: string): Promise<{ token: string; refreshToken: string; expiresInSeconds: number }>
  logout(refreshToken: string): Promise<void>
  verifyAccess(token: string): { userId: string; claims: C }

  // OTP-verified email/phone change (requires users.updateContact)
  requestContactChange(userId: string, channel: OtpChannel, destination: string): Promise<{ expiresInSeconds: number; sent: boolean }>
  confirmContactChange(userId: string, channel: OtpChannel, destination: string, code: string): Promise<AuthUser<P>>
}

export function createAuthService<P = unknown, C extends object = Record<string, never>>(
  args: CreateAuthServiceArgs<P, C>,
): AuthService<P, C> {
  const { users, session, hooks, providers = {} } = args
  const tokens = createTokenService<C>(args.tokens)
  const passwordRounds = args.passwordHashRounds ?? 12
  const buildClaims = args.claims ?? (() => ({}) as C)

  function requireOtp(): OtpService {
    if (!args.otp) throw new AuthError('NOT_SUPPORTED', 500, 'No OTP service configured')
    return args.otp
  }

  async function issueSession(user: AuthUser<P>, isNewUser: boolean, flow: string): Promise<AuthSession<P>> {
    const access = tokens.signAccess(user.id, buildClaims(user))
    const refresh = tokens.signRefresh(user.id)

    if (session.mode === 'rotating') {
      await session.store.add(user.id, refresh.jti, refresh.expiresAt)
    } else {
      await session.store.set(user.id, refresh.token)
    }

    await hooks?.onLogin?.(user, { flow })
    return {
      user,
      token: access,
      refreshToken: refresh.token,
      expiresInSeconds: tokens.accessTtlSeconds,
      isNewUser,
    }
  }

  async function findByDestination(channel: OtpChannel, destination: string): Promise<AuthUser<P> | null> {
    return channel === 'EMAIL' ? users.findByEmail(destination) : users.findByPhone(destination)
  }

  async function findOrCreate(
    contact: { email?: string | null; phone?: string | null },
    profile: P | undefined,
    flow: string,
  ): Promise<{ user: AuthUser<P>; isNewUser: boolean }> {
    const existing = contact.email
      ? await users.findByEmail(contact.email)
      : contact.phone
        ? await users.findByPhone(contact.phone)
        : null
    if (existing) return { user: existing, isNewUser: false }

    const user = await users.create({ ...contact, profile })
    await hooks?.onUserCreated?.(user, { flow })
    return { user, isNewUser: true }
  }

  return {
    // ── OTP-first ────────────────────────────────────────────────────────────
    requestOtp: (channel, destination) => requireOtp().request(channel, destination),

    async verifyOtp({ channel, destination, code, profile }) {
      const otp = requireOtp()
      const normalized = otp.normalize(channel, destination)
      await otp.verify(channel, normalized, code)

      const contact = channel === 'EMAIL' ? { email: normalized } : { phone: normalized }
      const { user, isNewUser } = await findOrCreate(contact, profile, 'otp')
      return issueSession(user, isNewUser, 'otp')
    },

    // ── Providers (Google / Apple) ───────────────────────────────────────────
    async signInWithProvider(provider, idToken, profile) {
      const verifier = providers[provider]
      if (!verifier) throw new AuthError('NOT_SUPPORTED', 500, `Provider "${provider}" not configured`)
      const identity = await verifier.verify(idToken)

      // 1. Already linked → sign in.
      let user = await users.findByProvider(identity.provider, identity.subject)
      let isNewUser = false

      if (!user && identity.email) {
        // 2. Same email exists → link the provider to that account.
        user = await users.findByEmail(identity.email)
        if (user) await users.linkProvider(user.id, identity.provider, identity.subject)
      }

      if (!user) {
        // 3. Brand new → create + link.
        user = await users.create({ email: identity.email ?? null, profile })
        await users.linkProvider(user.id, identity.provider, identity.subject)
        await hooks?.onUserCreated?.(user, { flow: provider })
        isNewUser = true
      }

      return issueSession(user, isNewUser, provider)
    },

    // ── Optional password flows ──────────────────────────────────────────────
    async loginWithPassword(email, password) {
      if (!users.getPasswordHash) {
        throw new AuthError('NOT_SUPPORTED', 500, 'Password login not enabled for this app')
      }
      const user = await users.findByEmail(email.trim().toLowerCase())
      const hash = user ? await users.getPasswordHash(user.id) : null
      // Single generic error — never reveal which part failed.
      if (!user || !hash || !(await bcrypt.compare(password, hash))) {
        throw new AuthError('INVALID_CREDENTIALS', 401, 'Invalid email or password')
      }
      return issueSession(user, false, 'password')
    },

    async registerWithPassword({ email, password, profile }) {
      if (!users.setPasswordHash) {
        throw new AuthError('NOT_SUPPORTED', 500, 'Password registration not enabled for this app')
      }
      const normalized = email.trim().toLowerCase()
      if (await users.findByEmail(normalized)) {
        throw new AuthError('CONTACT_TAKEN', 409, 'That email is already in use')
      }
      const user = await users.create({ email: normalized, profile })
      await users.setPasswordHash(user.id, await bcrypt.hash(password, passwordRounds))
      await hooks?.onUserCreated?.(user, { flow: 'password' })
      return issueSession(user, true, 'password')
    },

    // ── Sessions ─────────────────────────────────────────────────────────────
    async refresh(refreshToken) {
      const { userId, jti } = tokens.verifyRefresh(refreshToken)

      if (session.mode === 'rotating') {
        // Rotate: the used token dies, a fresh pair is born.
        if (!(await session.store.isActive(jti))) {
          // Replay: the token's signature verified but the jti is no longer
          // active — it was already rotated or revoked, so someone is holding
          // a stolen copy. Kill the whole family, not just this request.
          await session.store.revokeAllForUser(userId)
          throw new AuthError('SESSION_REVOKED', 401, 'Session expired — log in again')
        }
        await session.store.revoke(jti)
        const user = await users.findById(userId)
        if (!user) throw new AuthError('USER_NOT_FOUND', 404, 'Account not found')
        const access = tokens.signAccess(user.id, buildClaims(user))
        const next = tokens.signRefresh(user.id)
        await session.store.add(user.id, next.jti, next.expiresAt)
        return { token: access, refreshToken: next.token, expiresInSeconds: tokens.accessTtlSeconds }
      }

      // Static: same refresh token comes back — deliberately no rotation.
      const current = await session.store.get(userId)
      if (current !== refreshToken) {
        throw new AuthError('SESSION_REVOKED', 401, 'Session expired — log in again')
      }
      const user = await users.findById(userId)
      if (!user) throw new AuthError('USER_NOT_FOUND', 404, 'Account not found')
      return {
        token: tokens.signAccess(user.id, buildClaims(user)),
        refreshToken,
        expiresInSeconds: tokens.accessTtlSeconds,
      }
    },

    async logout(refreshToken) {
      // Best-effort: an invalid/expired token still "logs out" silently.
      try {
        const { userId, jti } = tokens.verifyRefresh(refreshToken)
        if (session.mode === 'rotating') await session.store.revoke(jti)
        else await session.store.set(userId, null)
      } catch {
        /* already dead — nothing to revoke */
      }
    },

    verifyAccess: (token) => tokens.verifyAccess(token),

    // ── OTP-verified contact change ───────────────────────────────────────────
    async requestContactChange(userId, channel, destination) {
      const otp = requireOtp()
      const normalized = otp.normalize(channel, destination)
      const holder = await findByDestination(channel, normalized)
      if (holder && holder.id !== userId) {
        throw new AuthError('CONTACT_TAKEN', 409, `That ${channel === 'EMAIL' ? 'email' : 'phone number'} is already in use`)
      }
      return otp.request(channel, normalized)
    },

    async confirmContactChange(userId, channel, destination, code) {
      if (!users.updateContact) {
        throw new AuthError('NOT_SUPPORTED', 500, 'Contact change not enabled for this app')
      }
      const otp = requireOtp()
      const normalized = otp.normalize(channel, destination)
      await otp.verify(channel, normalized, code)
      const holder = await findByDestination(channel, normalized) // re-check (race)
      if (holder && holder.id !== userId) {
        throw new AuthError('CONTACT_TAKEN', 409, `That ${channel === 'EMAIL' ? 'email' : 'phone number'} is already in use`)
      }
      return users.updateContact(
        userId,
        channel === 'EMAIL' ? { email: normalized } : { phone: normalized },
      )
    },
  }
}
