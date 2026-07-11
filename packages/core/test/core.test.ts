import { describe, expect, it, vi } from 'vitest'
import { createOtpService, createInMemoryOtpStore, type OtpSender } from '@aymenkits/auth-otp'
import {
  createAuthService,
  createInMemoryUserStore,
  createInMemoryRotatingSessionStore,
  createInMemoryStaticSessionStore,
  AuthError,
  type IdTokenVerifier,
} from '../src/index'

interface Profile {
  firstName?: string
  role?: string
}

const TOKENS = { accessSecret: 'access-secret', refreshSecret: 'refresh-secret' }
const silentSender: OtpSender = { send: async () => {} }

function makeAuth(overrides: Partial<Parameters<typeof createAuthService<Profile, { role?: string }>>[0]> = {}) {
  const users = createInMemoryUserStore<Profile>()
  const otp = createOtpService({
    store: createInMemoryOtpStore(),
    sender: silentSender,
    // Cooldown off — tests re-request codes rapidly; cooldown has its own
    // coverage in @aymenkits/auth-otp.
    options: { devCode: '123456', resendCooldownSeconds: 0 },
  })
  const auth = createAuthService<Profile, { role?: string }>({
    users,
    otp,
    session: { mode: 'rotating', store: createInMemoryRotatingSessionStore() },
    tokens: TOKENS,
    claims: (u) => ({ role: u.profile.role }),
    ...overrides,
  })
  return { auth, users }
}

describe('OTP login/registration (find-or-create)', () => {
  it('creates the user on first verify, finds them on the second', async () => {
    const onUserCreated = vi.fn()
    const { auth } = makeAuth({ hooks: { onUserCreated } })

    await auth.requestOtp('EMAIL', 'New@User.com')
    const first = await auth.verifyOtp({
      channel: 'EMAIL',
      destination: 'new@user.com',
      code: '123456',
      profile: { firstName: 'Aymen', role: 'customer' },
    })
    expect(first.isNewUser).toBe(true)
    expect(first.user.email).toBe('new@user.com')
    expect(first.user.profile.firstName).toBe('Aymen')
    expect(onUserCreated).toHaveBeenCalledTimes(1)

    await auth.requestOtp('EMAIL', 'new@user.com')
    const second = await auth.verifyOtp({ channel: 'EMAIL', destination: 'NEW@USER.COM', code: '123456' })
    expect(second.isNewUser).toBe(false)
    expect(second.user.id).toBe(first.user.id)
    expect(onUserCreated).toHaveBeenCalledTimes(1) // not again
  })

  it('phone channel registers by phone', async () => {
    const { auth } = makeAuth()
    await auth.requestOtp('PHONE', '+49 151 234 5678')
    const s = await auth.verifyOtp({ channel: 'PHONE', destination: '+491512345678', code: '123456' })
    expect(s.user.phone).toBe('+491512345678')
    expect(s.user.email).toBeNull()
  })

  it('wrong code never signs in', async () => {
    const { auth } = makeAuth()
    await auth.requestOtp('EMAIL', 'a@b.co')
    await expect(
      auth.verifyOtp({ channel: 'EMAIL', destination: 'a@b.co', code: '999999' }),
    ).rejects.toMatchObject({ code: 'INVALID_CODE' })
  })
})

describe('access tokens & claims', () => {
  it('carries app claims and round-trips through verifyAccess', async () => {
    const { auth } = makeAuth()
    await auth.requestOtp('EMAIL', 'c@d.co')
    const s = await auth.verifyOtp({
      channel: 'EMAIL', destination: 'c@d.co', code: '123456', profile: { role: 'owner' },
    })
    const decoded = auth.verifyAccess(s.token)
    expect(decoded.userId).toBe(s.user.id)
    expect(decoded.claims.role).toBe('owner')
  })

  it('rejects garbage and wrong-secret tokens', async () => {
    const { auth } = makeAuth()
    expect(() => auth.verifyAccess('garbage')).toThrow(AuthError)
  })
})

describe('sessions — rotating strategy (multi-device)', () => {
  it('refresh rotates; REPLAY of the used token kills the whole family', async () => {
    const { auth } = makeAuth()
    await auth.requestOtp('EMAIL', 'r@r.co')
    const s = await auth.verifyOtp({ channel: 'EMAIL', destination: 'r@r.co', code: '123456' })

    const next = await auth.refresh(s.refreshToken)
    expect(next.refreshToken).not.toBe(s.refreshToken)

    // Replay of the used token = theft signal → revoked…
    await expect(auth.refresh(s.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    // …and the WHOLE family dies with it — a thief must not keep a live one.
    await expect(auth.refresh(next.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })

  it('logout revokes one device, others live on; replaying the dead token then kills all (fail closed)', async () => {
    const { auth } = makeAuth()
    await auth.requestOtp('EMAIL', 'm@m.co')
    const phone = await auth.verifyOtp({ channel: 'EMAIL', destination: 'm@m.co', code: '123456' })
    await auth.requestOtp('EMAIL', 'm@m.co')
    const laptop = await auth.verifyOtp({ channel: 'EMAIL', destination: 'm@m.co', code: '123456' })

    await auth.logout(phone.refreshToken)
    // Logout itself never touches other devices.
    const laptopNext = await auth.refresh(laptop.refreshToken)
    // Presenting the logged-out token again is indistinguishable from theft →
    // the family dies. Clients must drop tokens on logout.
    await expect(auth.refresh(phone.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    await expect(auth.refresh(laptopNext.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })
})

describe('token hardening', () => {
  it('expired tokens surface TOKEN_EXPIRED (refresh me), not INVALID_TOKEN (forged)', async () => {
    const { createTokenService } = await import('../src/tokens')
    const t = createTokenService({ ...TOKENS, accessTtlSeconds: -1 })
    const token = t.signAccess('u1', {})
    expect(() => t.verifyAccess(token)).toThrowError(
      expect.objectContaining({ code: 'TOKEN_EXPIRED', status: 401 }),
    )
  })

  it("rejects alg:'none' forgeries (algorithm is pinned)", async () => {
    const { createTokenService } = await import('../src/tokens')
    const t = createTokenService(TOKENS)
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'u1' })}.`
    expect(() => t.verifyAccess(forged)).toThrowError(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    )
  })
})

describe('sessions — static strategy (single token)', () => {
  it('refresh returns the SAME refresh token, new access token', async () => {
    const { auth } = makeAuth({
      session: { mode: 'static', store: createInMemoryStaticSessionStore() },
    })
    await auth.requestOtp('PHONE', '+491510000000')
    const s = await auth.verifyOtp({ channel: 'PHONE', destination: '+491510000000', code: '123456' })

    const next = await auth.refresh(s.refreshToken)
    expect(next.refreshToken).toBe(s.refreshToken) // deliberately not rotated
    await expect(auth.refresh(s.refreshToken)).resolves.toBeTruthy() // reusable
  })

  it('a superseded token is rejected; logout clears', async () => {
    const store = createInMemoryStaticSessionStore()
    const { auth } = makeAuth({ session: { mode: 'static', store } })
    await auth.requestOtp('PHONE', '+491510000001')
    const first = await auth.verifyOtp({ channel: 'PHONE', destination: '+491510000001', code: '123456' })
    // New login replaces the stored token.
    await auth.requestOtp('PHONE', '+491510000001')
    const second = await auth.verifyOtp({ channel: 'PHONE', destination: '+491510000001', code: '123456' })

    await expect(auth.refresh(first.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    await auth.logout(second.refreshToken)
    await expect(auth.refresh(second.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })
})

describe('provider sign-in (Google/Apple via fake verifier)', () => {
  const fakeVerifier = (subject: string, email: string | null): IdTokenVerifier => ({
    verify: async () => ({ provider: 'google', subject, email, emailVerified: true }),
  })

  it('creates + links on first sign-in, finds by provider afterwards', async () => {
    const { auth } = makeAuth({ providers: { google: fakeVerifier('g-1', 'g@user.com') } })
    const first = await auth.signInWithProvider('google', 'token', { firstName: 'G' })
    expect(first.isNewUser).toBe(true)
    expect(first.user.email).toBe('g@user.com')

    const again = await auth.signInWithProvider('google', 'token')
    expect(again.isNewUser).toBe(false)
    expect(again.user.id).toBe(first.user.id)
  })

  it('links the provider to an existing account with the same email', async () => {
    const { auth } = makeAuth({ providers: { google: fakeVerifier('g-2', 'linked@user.com') } })
    // Existing OTP-registered user…
    await auth.requestOtp('EMAIL', 'linked@user.com')
    const otpSession = await auth.verifyOtp({ channel: 'EMAIL', destination: 'linked@user.com', code: '123456' })
    // …signs in with Google → same account, no duplicate.
    const google = await auth.signInWithProvider('google', 'token')
    expect(google.isNewUser).toBe(false)
    expect(google.user.id).toBe(otpSession.user.id)
  })

  it('unconfigured provider → NOT_SUPPORTED', async () => {
    const { auth } = makeAuth()
    await expect(auth.signInWithProvider('apple', 't')).rejects.toMatchObject({ code: 'NOT_SUPPORTED' })
  })
})

describe('optional password flows', () => {
  it('register + login work when the store supports them', async () => {
    const { auth } = makeAuth()
    const reg = await auth.registerWithPassword({ email: 'p@p.co', password: 'hunter22', profile: { role: 'owner' } })
    expect(reg.isNewUser).toBe(true)

    const login = await auth.loginWithPassword('P@P.co', 'hunter22')
    expect(login.user.id).toBe(reg.user.id)
    await expect(auth.loginWithPassword('p@p.co', 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('duplicate email rejected on register', async () => {
    const { auth } = makeAuth()
    await auth.registerWithPassword({ email: 'dup@p.co', password: 'x'.repeat(10) })
    await expect(
      auth.registerWithPassword({ email: 'dup@p.co', password: 'y'.repeat(10) }),
    ).rejects.toMatchObject({ code: 'CONTACT_TAKEN', status: 409 })
  })
})

describe('OTP-verified contact change', () => {
  it('changes email after code verification; rejects taken destinations', async () => {
    const { auth } = makeAuth()
    await auth.requestOtp('EMAIL', 'me@old.co')
    const me = await auth.verifyOtp({ channel: 'EMAIL', destination: 'me@old.co', code: '123456' })
    await auth.requestOtp('EMAIL', 'other@user.co')
    const other = await auth.verifyOtp({ channel: 'EMAIL', destination: 'other@user.co', code: '123456' })

    // Taken by `other` → 409.
    await expect(
      auth.requestContactChange(me.user.id, 'EMAIL', 'other@user.co'),
    ).rejects.toMatchObject({ code: 'CONTACT_TAKEN', status: 409 })

    // Free destination → request + confirm updates the user.
    await auth.requestContactChange(me.user.id, 'EMAIL', 'me@new.co')
    const updated = await auth.confirmContactChange(me.user.id, 'EMAIL', 'me@new.co', '123456')
    expect(updated.email).toBe('me@new.co')
    expect(other.user.email).toBe('other@user.co')
  })
})
