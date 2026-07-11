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
import type { AuthService } from '@aymenkits/auth-core'
import { AuthError } from '@aymenkits/auth-core'
import { OtpError, type OtpChannel } from '@aymenkits/auth-otp'

// ── Structural HTTP types (Express 4 + 5 compatible) ─────────────────────────

export interface MinimalRequest {
  headers: Record<string, unknown>
  body?: unknown
  /** Populated by requireAuth / optionalAuth. */
  auth?: { userId: string; claims: Record<string, unknown> }
}
export interface MinimalResponse {
  status(code: number): MinimalResponse
  json(body: unknown): unknown
}
export type NextFn = (err?: unknown) => void
type Handler = (req: MinimalRequest, res: MinimalResponse, next?: NextFn) => void | Promise<void>

// ── Error mapping ─────────────────────────────────────────────────────────────

/** Map kit errors to HTTP; unknown errors → 500 (or forward with onError:'next'). */
export function sendKitError(res: MinimalResponse, err: unknown): void {
  if (err instanceof AuthError || err instanceof OtpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }
  // Unknown = a bug or an outage — never swallow it silently.
  console.error('[authkit/express] unhandled error:', err)
  res.status(500).json({ error: { code: 'InternalError', message: 'Something went wrong' } })
}

// ── Middleware ────────────────────────────────────────────────────────────────

export interface AuthMiddleware {
  /** 401 unless a valid Bearer token is present; attaches req.auth. */
  requireAuth: Handler
  /** Attaches req.auth when a valid token is present; never blocks. */
  optionalAuth: Handler
  /** 403 unless the claims satisfy the predicate (compose after requireAuth). */
  requireClaims(
    predicate: (claims: Record<string, unknown>) => boolean,
    message?: string,
  ): Handler
}

export function createAuthMiddleware(
  auth: Pick<AuthService<unknown, Record<string, unknown>>, 'verifyAccess'>,
): AuthMiddleware {
  function extractToken(req: MinimalRequest): string | null {
    const header = req.headers['authorization']
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null
    return header.slice('Bearer '.length)
  }

  return {
    requireAuth(req, res, next) {
      const token = extractToken(req)
      if (!token) {
        res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Authentication required' } })
        return
      }
      try {
        req.auth = auth.verifyAccess(token)
        next?.()
      } catch (err) {
        sendKitError(res, err)
      }
    },

    optionalAuth(req, _res, next) {
      const token = extractToken(req)
      if (token) {
        try {
          req.auth = auth.verifyAccess(token)
        } catch {
          /* anonymous */
        }
      }
      next?.()
    },

    requireClaims(predicate, message = 'Forbidden') {
      return (req, res, next) => {
        if (!req.auth || !predicate(req.auth.claims)) {
          res.status(403).json({ error: { code: 'FORBIDDEN', message } })
          return
        }
        next?.()
      }
    },
  }
}

// ── Standard endpoint handlers ────────────────────────────────────────────────

export interface AuthHandlersOptions {
  /** Wrap successful payloads in your app's envelope. */
  wrapResponse?: (data: unknown) => unknown
  /** 'respond' (default) sends kit errors; 'next' forwards to your error middleware. */
  onError?: 'respond' | 'next'
}

function asBody(req: MinimalRequest): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function channel(v: unknown): OtpChannel {
  return v === 'PHONE' ? 'PHONE' : 'EMAIL'
}

export function createAuthHandlers<P>(
  auth: AuthService<P, Record<string, unknown>>,
  options: AuthHandlersOptions = {},
) {
  const wrap = options.wrapResponse ?? ((d: unknown) => d)

  function guarded(fn: (req: MinimalRequest) => Promise<unknown>): Handler {
    return async (req, res, next) => {
      try {
        res.json(wrap(await fn(req)))
      } catch (err) {
        if (options.onError === 'next' && next) next(err)
        else sendKitError(res, err)
      }
    }
  }

  return {
    /** POST { channel, destination } */
    otpRequest: guarded(async (req) => {
      const b = asBody(req)
      return auth.requestOtp(channel(b.channel), str(b.destination))
    }),

    /** POST { channel, destination, code, profile? } → session */
    otpVerify: guarded(async (req) => {
      const b = asBody(req)
      return auth.verifyOtp({
        channel: channel(b.channel),
        destination: str(b.destination),
        code: str(b.code),
        profile: b.profile as P | undefined,
      })
    }),

    /** POST { provider, idToken, profile? } → session (google/apple/…) */
    providerSignIn: guarded(async (req) => {
      const b = asBody(req)
      return auth.signInWithProvider(str(b.provider), str(b.idToken), b.profile as P | undefined)
    }),

    /** POST { refreshToken } → new pair (rotating) / new access (static) */
    refresh: guarded(async (req) => auth.refresh(str(asBody(req).refreshToken))),

    /** POST { refreshToken } — always 200 (logout is best-effort). */
    logout: guarded(async (req) => {
      await auth.logout(str(asBody(req).refreshToken))
      return { ok: true }
    }),

    /** POST { channel, destination } — authed; code goes to the NEW destination. */
    contactChangeRequest: guarded(async (req) => {
      if (!req.auth) throw new AuthError('INVALID_TOKEN', 401, 'Authentication required')
      const b = asBody(req)
      return auth.requestContactChange(req.auth.userId, channel(b.channel), str(b.destination))
    }),

    /** POST { channel, destination, code } — authed; writes the verified contact. */
    contactChangeConfirm: guarded(async (req) => {
      if (!req.auth) throw new AuthError('INVALID_TOKEN', 401, 'Authentication required')
      const b = asBody(req)
      return {
        user: await auth.confirmContactChange(
          req.auth.userId,
          channel(b.channel),
          str(b.destination),
          str(b.code),
        ),
      }
    }),
  }
}
