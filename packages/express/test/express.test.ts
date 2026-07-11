import { describe, expect, it } from 'vitest'
import { createOtpService, createInMemoryOtpStore } from '@aymenkits/auth-otp'
import {
  createAuthService,
  createInMemoryUserStore,
  createInMemoryRotatingSessionStore,
} from '@aymenkits/auth-core'
import { createAuthMiddleware, createAuthHandlers, type MinimalRequest } from '../src/index'

function makeAuth() {
  return createAuthService<{ name?: string }, Record<string, unknown>>({
    users: createInMemoryUserStore(),
    otp: createOtpService({
      store: createInMemoryOtpStore(),
      sender: { send: async () => {} },
      options: { devCode: '123456', resendCooldownSeconds: 0 },
    }),
    session: { mode: 'rotating', store: createInMemoryRotatingSessionStore() },
    tokens: { accessSecret: 'a', refreshSecret: 'r' },
    claims: (u) => ({ email: u.email }),
  })
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return payload
    },
  }
  return res
}

describe('middleware', () => {
  it('requireAuth: 401 without token, attaches req.auth with one', async () => {
    const auth = makeAuth()
    const { requireAuth } = createAuthMiddleware(auth)

    const anon: MinimalRequest = { headers: {} }
    const res = mockRes()
    requireAuth(anon, res, () => {})
    expect(res.statusCode).toBe(401)

    await auth.requestOtp('EMAIL', 'a@b.co')
    const session = await auth.verifyOtp({ channel: 'EMAIL', destination: 'a@b.co', code: '123456' })
    const req: MinimalRequest = { headers: { authorization: `Bearer ${session.token}` } }
    let nexted = false
    requireAuth(req, mockRes(), () => (nexted = true))
    expect(nexted).toBe(true)
    expect(req.auth!.userId).toBe(session.user.id)
  })

  it('requireClaims gates on the claim predicate', async () => {
    const auth = makeAuth()
    const { requireAuth, requireClaims } = createAuthMiddleware(auth)
    await auth.requestOtp('EMAIL', 'c@d.co')
    const session = await auth.verifyOtp({ channel: 'EMAIL', destination: 'c@d.co', code: '123456' })

    const req: MinimalRequest = { headers: { authorization: `Bearer ${session.token}` } }
    requireAuth(req, mockRes(), () => {})

    const res = mockRes()
    let passed = false
    requireClaims((c) => c.email === 'c@d.co')(req, res, () => (passed = true))
    expect(passed).toBe(true)

    const res2 = mockRes()
    requireClaims((c) => c.email === 'other')(req, res2, () => {})
    expect(res2.statusCode).toBe(403)
  })
})

describe('handlers', () => {
  it('otpRequest → otpVerify issues a session; envelope applied', async () => {
    const handlers = createAuthHandlers(makeAuth(), { wrapResponse: (d) => ({ data: d }) })

    const res1 = mockRes()
    await handlers.otpRequest({ headers: {}, body: { channel: 'EMAIL', destination: 'x@y.co' } }, res1)
    expect((res1.body as { data: { expiresInSeconds: number } }).data.expiresInSeconds).toBe(600)

    const res2 = mockRes()
    await handlers.otpVerify(
      { headers: {}, body: { channel: 'EMAIL', destination: 'x@y.co', code: '123456', profile: { name: 'A' } } },
      res2,
    )
    const session = (res2.body as { data: { token: string; isNewUser: boolean } }).data
    expect(session.isNewUser).toBe(true)
    expect(session.token).toBeTruthy()
  })

  it('maps kit errors to their HTTP status (bad code → 401)', async () => {
    const handlers = createAuthHandlers(makeAuth())
    const res0 = mockRes()
    await handlers.otpRequest({ headers: {}, body: { channel: 'EMAIL', destination: 'e@e.co' } }, res0)

    const res = mockRes()
    await handlers.otpVerify(
      { headers: {}, body: { channel: 'EMAIL', destination: 'e@e.co', code: '000000' } },
      res,
    )
    expect(res.statusCode).toBe(401)
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_CODE')
  })
})
