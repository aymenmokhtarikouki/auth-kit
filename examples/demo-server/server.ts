/**
 * auth-kit demo — every identity flow wired with in-memory stores, zero
 * external services. OTP dev code: 123456 (nothing is sent). Try:
 *
 *   curl -X POST :4830/auth/otp/request -H 'content-type: application/json' \
 *        -d '{"channel":"EMAIL","destination":"me@demo.co"}'
 *   curl -X POST :4830/auth/otp/verify -H 'content-type: application/json' \
 *        -d '{"channel":"EMAIL","destination":"me@demo.co","code":"123456","profile":{"firstName":"Aymen"}}'
 *   curl :4830/users/me -H 'authorization: Bearer <token>'
 *
 * (The address book + geocoding demo lives in location-kit.)
 */
import express from 'express'
import { createOtpService, createInMemoryOtpStore } from '@aymenkits/auth-otp'
import {
  createAuthService,
  createInMemoryUserStore,
  createInMemoryRotatingSessionStore,
} from '@aymenkits/auth-core'
import { createAuthMiddleware, createAuthHandlers } from '@aymenkits/auth-express'

// One-time declaration merge so Express's Request knows about the `auth`
// field the authkit middleware attaches. Every consumer app adds this once
// (documented in docs/INTEGRATION.md) — @aymenkits/auth-express itself deliberately
// carries no @types/express dependency.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; claims: Record<string, unknown> }
    }
  }
}

interface Profile {
  firstName?: string
  lastName?: string
}

// ── Wiring (the part each app does once, on ITS storage) ────────────────────

const users = createInMemoryUserStore<Profile>()

const otp = createOtpService({
  store: createInMemoryOtpStore(),
  sender: { send: async () => {} }, // devCode set → nothing is ever sent
  options: { devCode: '123456' },
})

const auth = createAuthService<Profile, { email: string | null }>({
  users,
  otp,
  session: { mode: 'rotating', store: createInMemoryRotatingSessionStore() },
  tokens: { accessSecret: 'demo-access-secret', refreshSecret: 'demo-refresh-secret' },
  claims: (u) => ({ email: u.email }),
  hooks: {
    onUserCreated: (u) => console.log(`[demo] user created: ${u.id} (${u.email ?? u.phone})`),
  },
})

// ── HTTP ─────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

const { requireAuth } = createAuthMiddleware(auth)
const handlers = createAuthHandlers(auth, { wrapResponse: (data) => ({ data }) })

app.post('/auth/otp/request', handlers.otpRequest)
app.post('/auth/otp/verify', handlers.otpVerify)
app.post('/auth/provider', handlers.providerSignIn)
app.post('/auth/refresh', handlers.refresh)
app.post('/auth/logout', handlers.logout)
app.post('/users/me/contact/request', requireAuth, handlers.contactChangeRequest)
app.post('/users/me/contact/verify', requireAuth, handlers.contactChangeConfirm)

app.get('/users/me', requireAuth, async (req, res) => {
  const user = await users.findById(req.auth!.userId)
  res.json({ data: { user } })
})

const PORT = Number(process.env.PORT ?? 4830)
app.listen(PORT, () => {
  console.log(`auth-kit demo → http://localhost:${PORT} (OTP dev code: 123456)`)
})
