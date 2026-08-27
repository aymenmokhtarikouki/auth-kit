/**
 * Provider ID-token verifiers. Both Google and Apple sign-in reduce to:
 * verify the provider's signed JWT against their published JWKS, check
 * issuer + audience, extract the stable subject + email.
 *
 * Works for Flutter (native sign-in SDKs return these tokens), web one-tap,
 * AND redirect OAuth (the callback's id_token feeds the same verifier).
 * Apps already on firebase-admin can keep it: any `IdTokenVerifier` plugs in.
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

// One lazy import for the whole module (jose is ESM-only; Node caches it).
let josePromise: Promise<typeof import('jose')> | null = null

function createJwksVerifier(config: JwksVerifierConfig): IdTokenVerifier {
  // Cache the remote JWKS across calls (jose caches + re-fetches on rotation).
  let jwksPromise: Promise<ReturnType<typeof import('jose').createRemoteJWKSet>> | null = null

  return {
    async verify(idToken: string): Promise<ProviderIdentity> {
      try {
        const { createRemoteJWKSet, jwtVerify } = await (josePromise ??= import('jose'))
        jwksPromise ??= Promise.resolve(createRemoteJWKSet(new URL(config.jwksUrl)))
        const jwks = await jwksPromise

        const { payload } = await jwtVerify(idToken, jwks, {
          issuer: config.issuer,
          audience: config.clientIds,
          // Google + Apple ID tokens are RS256 — pin it.
          algorithms: ['RS256'],
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

/**
 * GitHub sign-in — and it does NOT work like the two above.
 *
 * Google and Apple hand the client a signed OIDC ID token, so verification is
 * offline: check the signature against published JWKS, check `iss`/`aud`, read
 * the subject. A GitHub OAuth App issues no ID token at all. What the client
 * ends up holding is an ACCESS TOKEN, which carries no signature to check and
 * no audience to pin — it is an opaque bearer string that GitHub alone can
 * interpret. So this verifier asks GitHub, over the network, twice.
 *
 * THE ATTACK THIS EXISTS TO STOP. An access token does not say who it was
 * issued FOR. Any other site running "Sign in with GitHub" also receives its
 * users' tokens, and a malicious one could replay a token it collected against
 * THIS backend: `GET /user` would answer happily, the identity would look
 * perfect, and it would sign in as that user. That is the classic OAuth token
 * substitution / "confused deputy" hole, and it is why an access-token login
 * is not simply a Bearer call to /user.
 *
 * The fix is GitHub's own check-token endpoint: POST the token to
 * `/applications/{client_id}/token` with the app's client_id:client_secret as
 * HTTP Basic. GitHub answers 200 only when that token belongs to THAT app, and
 * 404 otherwise — the audience check the token itself cannot carry. It is
 * mandatory here rather than optional, because a verifier that silently
 * accepts other apps' tokens is worse than no verifier: it looks like it works.
 *
 * Email needs a second call. `GET /user` returns `email` only when the user
 * made it public — for most accounts it is null — so the primary verified
 * address is read from `GET /user/emails`, which needs the `user:email` scope.
 * A token without that scope still signs in; it just arrives with no email,
 * which the caller can treat as it treats an unverified one.
 */
export function githubAccessTokenVerifier(options: {
  /** OAuth App client id — also the audience this token must belong to. */
  clientId: string
  /** OAuth App client secret. Used ONLY for the check-token Basic auth. */
  clientSecret: string
  /** GitHub requires a User-Agent on every API call; name your app. */
  userAgent?: string
  /** Override for GitHub Enterprise Server. Default: api.github.com. */
  apiBaseUrl?: string
}): IdTokenVerifier {
  const api = (options.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '')
  const ua = options.userAgent ?? 'auth-kit'
  const headers = (token: string): Record<string, string> => ({
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': ua,
    authorization: `Bearer ${token}`,
  })

  return {
    async verify(accessToken: string): Promise<ProviderIdentity> {
      try {
        // 1. AUDIENCE. Does this token belong to THIS app? Basic auth with the
        //    app's own credentials; the token travels in the body, never a URL.
        const basic = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64')
        const owned = await fetch(`${api}/applications/${options.clientId}/token`, {
          method: 'POST',
          headers: {
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
            'user-agent': ua,
            authorization: `Basic ${basic}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ access_token: accessToken }),
        })
        if (!owned.ok) {
          // 404 = not this app's token (or revoked); 422 = malformed. Both are
          // "not ours", and neither is worth telling a caller apart: an
          // attacker learns nothing from a single refusal.
          throw new AuthError('PROVIDER_ERROR', 401, 'Could not verify github token')
        }

        // 2. IDENTITY. `id` is the stable subject — `login` is NOT: a user can
        //    rename, and the next person may take the freed name.
        const userRes = await fetch(`${api}/user`, { headers: headers(accessToken) })
        if (!userRes.ok) throw new Error(`user ${userRes.status}`)
        const user = (await userRes.json()) as {
          id?: number
          login?: string
          name?: string | null
          email?: string | null
        }
        if (typeof user.id !== 'number') throw new Error('missing id')

        // 3. EMAIL. Public-profile email is usually null; the primary verified
        //    address lives behind `user:email`. No scope → no email, not a
        //    failure: the account still has a stable subject to key on.
        let email = typeof user.email === 'string' ? user.email.toLowerCase() : null
        let emailVerified = false
        const mailRes = await fetch(`${api}/user/emails`, { headers: headers(accessToken) })
        if (mailRes.ok) {
          const list = (await mailRes.json()) as Array<{
            email?: string
            primary?: boolean
            verified?: boolean
          }>
          const primary = list.find((e) => e.primary) ?? list.find((e) => e.verified)
          if (primary?.email) {
            email = primary.email.toLowerCase()
            emailVerified = primary.verified === true
          }
        }

        return {
          provider: 'github',
          subject: String(user.id),
          email,
          emailVerified,
          name: user.name ?? user.login ?? null,
        }
      } catch (e) {
        if (e instanceof AuthError) throw e
        throw new AuthError('PROVIDER_ERROR', 401, 'Could not verify github token')
      }
    },
  }
}
