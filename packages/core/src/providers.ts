/**
 * Provider ID-token verifiers. Both Google and Apple sign-in reduce to:
 * verify the provider's signed JWT against their published JWKS, check
 * issuer + audience, extract the stable subject + email.
 *
 * Works for Flutter (native sign-in SDKs return these tokens), web one-tap,
 * AND redirect OAuth (the callback's id_token feeds the same verifier).
 * Lineo can keep firebase-admin instead: any `IdTokenVerifier` plugs in.
 *
 * `jose` is ESM-only, so it is loaded lazily via dynamic import — CJS apps
 * (both backends) stay compatible.
 */
import type { IdTokenVerifier, ProviderIdentity } from './types'
import { AuthError } from './types'

interface JwksVerifierConfig {
  provider: string
  jwksUrl: string
  issuer: string | string[]
  /** Accepted `aud` values — your OAuth client id(s) / Apple service id(s). */
  clientIds: string[]
}

function createJwksVerifier(config: JwksVerifierConfig): IdTokenVerifier {
  // Cache the remote JWKS across calls (jose caches + re-fetches on rotation).
  let jwksPromise: Promise<ReturnType<typeof import('jose').createRemoteJWKSet>> | null = null

  return {
    async verify(idToken: string): Promise<ProviderIdentity> {
      try {
        const { createRemoteJWKSet, jwtVerify } = await import('jose')
        jwksPromise ??= Promise.resolve(createRemoteJWKSet(new URL(config.jwksUrl)))
        const jwks = await jwksPromise

        const { payload } = await jwtVerify(idToken, jwks, {
          issuer: config.issuer,
          audience: config.clientIds,
        })
        if (!payload.sub) throw new Error('missing sub')

        return {
          provider: config.provider,
          subject: payload.sub,
          email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
          emailVerified:
            payload.email_verified === true || payload.email_verified === 'true',
          name: typeof payload.name === 'string' ? payload.name : null,
        }
      } catch (e) {
        if (e instanceof AuthError) throw e
        throw new AuthError('PROVIDER_ERROR', 401, `Could not verify ${config.provider} token`)
      }
    },
  }
}

/** Google Sign-In / One-Tap / Firebase-issued Google ID tokens. */
export function googleIdTokenVerifier(options: { clientIds: string[] }): IdTokenVerifier {
  return createJwksVerifier({
    provider: 'google',
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    clientIds: options.clientIds,
  })
}

/** Sign in with Apple identity tokens (iOS native + web). */
export function appleIdTokenVerifier(options: { clientIds: string[] }): IdTokenVerifier {
  return createJwksVerifier({
    provider: 'apple',
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    issuer: 'https://appleid.apple.com',
    clientIds: options.clientIds,
  })
}
