/**
 * JWT issuing/verification. Uses `jsonwebtoken` with HS256 + two secrets —
 * the SAME library and shape both apps use today, so adopting the kit keeps
 * existing tokens valid (a hard migration requirement).
 */
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { TokenOptions } from './types'
import { AuthError } from './types'

export const DEFAULT_ACCESS_TTL_SECONDS = 900 // 15 min
export const DEFAULT_REFRESH_TTL_SECONDS = 180 * 24 * 3600 // 180 days

export interface TokenService<C extends object = Record<string, never>> {
  signAccess(userId: string, claims: C): string
  verifyAccess(token: string): { userId: string; claims: C }
  signRefresh(userId: string): { token: string; jti: string; expiresAt: Date }
  verifyRefresh(token: string): { userId: string; jti: string }
  accessTtlSeconds: number
  refreshTtlSeconds: number
}

export function createTokenService<C extends object>(options: TokenOptions): TokenService<C> {
  const accessTtlSeconds = options.accessTtlSeconds ?? DEFAULT_ACCESS_TTL_SECONDS
  const refreshTtlSeconds = options.refreshTtlSeconds ?? DEFAULT_REFRESH_TTL_SECONDS

  return {
    accessTtlSeconds,
    refreshTtlSeconds,

    signAccess(userId, claims) {
      return jwt.sign({ ...claims }, options.accessSecret, {
        subject: userId,
        expiresIn: accessTtlSeconds,
        ...(options.issuer ? { issuer: options.issuer } : {}),
      })
    },

    verifyAccess(token) {
      try {
        const payload = jwt.verify(token, options.accessSecret, {
          // Pin the algorithm — never let the token header pick it.
          algorithms: ['HS256'],
          ...(options.issuer ? { issuer: options.issuer } : {}),
        }) as jwt.JwtPayload
        if (!payload.sub) throw new Error('missing sub')
        const { sub, iat, exp, iss, jti, ...claims } = payload
        return { userId: sub, claims: claims as C }
      } catch (err) {
        // Expired ≠ forged: clients refresh on TOKEN_EXPIRED, hard-logout on
        // INVALID_TOKEN.
        if (err instanceof jwt.TokenExpiredError) {
          throw new AuthError('TOKEN_EXPIRED', 401, 'Access token expired — refresh the session')
        }
        throw new AuthError('INVALID_TOKEN', 401, 'Invalid access token')
      }
    },

    signRefresh(userId) {
      const jti = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000)
      const token = jwt.sign({}, options.refreshSecret, {
        subject: userId,
        jwtid: jti,
        expiresIn: refreshTtlSeconds,
        ...(options.issuer ? { issuer: options.issuer } : {}),
      })
      return { token, jti, expiresAt }
    },

    verifyRefresh(token) {
      try {
        const payload = jwt.verify(token, options.refreshSecret, {
          algorithms: ['HS256'],
          ...(options.issuer ? { issuer: options.issuer } : {}),
        }) as jwt.JwtPayload
        if (!payload.sub || !payload.jti) throw new Error('missing sub/jti')
        return { userId: payload.sub, jti: payload.jti }
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
          throw new AuthError('TOKEN_EXPIRED', 401, 'Refresh token expired — sign in again')
        }
        throw new AuthError('INVALID_TOKEN', 401, 'Invalid refresh token')
      }
    },
  }
}
