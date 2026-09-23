/**
 * Google and Apple sign-in through the REAL verifiers: RS256 tokens signed
 * here and checked by jose for signature, issuer, audience and algorithm.
 * Only the JWKS download is swapped for the test key — jose fetches it over
 * node:https, which no test should reach. That mock is module-wide, which is
 * why these tests live in their own file.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose'
import {
  appleIdTokenVerifier,
  createAuthService,
  createInMemoryRotatingSessionStore,
  createInMemoryUserStore,
  googleIdTokenVerifier,
} from '../src/index'

const published = vi.hoisted(() => ({ keys: [] as JWK[] }))
vi.mock('jose', async (importOriginal) => {
  const jose = await importOriginal<typeof import('jose')>()
  return { ...jose, createRemoteJWKSet: () => jose.createLocalJWKSet(published) }
})

const CLIENT_ID = 'test-client'
const ISSUER = { google: 'https://accounts.google.com', apple: 'https://appleid.apple.com' }
let signingKey: KeyLike

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  signingKey = pair.privateKey
  published.keys.push({ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' })
})

function idToken(provider: keyof typeof ISSUER, claims: Record<string, unknown>, key = signingKey) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(ISSUER[provider])
    .setAudience(CLIENT_ID)
    .setSubject(`${provider}-user-1`)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}

function makeAuth() {
  const users = createInMemoryUserStore()
  const auth = createAuthService({
    users,
    session: { mode: 'rotating', store: createInMemoryRotatingSessionStore() },
    tokens: { accessSecret: 'access-secret', refreshSecret: 'refresh-secret' },
    providers: {
      google: googleIdTokenVerifier({ clientIds: [CLIENT_ID] }),
      apple: appleIdTokenVerifier({ clientIds: [CLIENT_ID] }),
    },
  })
  return { auth, users }
}

/** The claims as each provider sends them — Apple's flag is a string. */
const withFlag = (emailVerified: boolean | string | undefined) => ({
  email: 'Owner@Example.com',
  ...(emailVerified === undefined ? {} : { email_verified: emailVerified }),
})

describe('Google/Apple ID tokens — only a verified address links', () => {
  it('verifies for real: a token signed with another key is refused', async () => {
    const { auth } = makeAuth()
    const stranger = (await generateKeyPair('RS256')).privateKey
    await expect(
      auth.signInWithProvider('google', await idToken('google', withFlag(true), stranger)),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it.each([
    ['google', true],
    ['apple', 'true'],
  ] as const)('%s, email_verified=%s → joins the account that has the address', async (provider, flag) => {
    const { auth, users } = makeAuth()
    const owner = await users.create({ email: 'owner@example.com' })

    const session = await auth.signInWithProvider(provider, await idToken(provider, withFlag(flag)))
    expect(session.user.id).toBe(owner.id)
    expect(session.isNewUser).toBe(false)
  })

  it.each([
    ['google', false],
    ['google', undefined],
    ['apple', 'false'],
  ] as const)('%s, email_verified=%s → an account of its own, without the address', async (provider, flag) => {
    const { auth, users } = makeAuth()
    const owner = await users.create({ email: 'owner@example.com' })
    const linkProvider = vi.spyOn(users, 'linkProvider')

    const session = await auth.signInWithProvider(provider, await idToken(provider, withFlag(flag)))
    expect(session.user.id).not.toBe(owner.id)
    expect(session.isNewUser).toBe(true)
    expect(session.user.email).toBeNull()
    expect(linkProvider).not.toHaveBeenCalledWith(owner.id, expect.anything(), expect.anything())
  })
})
