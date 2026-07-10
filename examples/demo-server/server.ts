/**
 * auth-kit demo — every flow wired with in-memory stores, zero external
 * services. OTP dev code: 123456 (printed nothing is sent). Try:
 *
 *   curl -X POST :4830/auth/otp/request -H 'content-type: application/json' \
 *        -d '{"channel":"EMAIL","destination":"me@demo.co"}'
 *   curl -X POST :4830/auth/otp/verify -H 'content-type: application/json' \
 *        -d '{"channel":"EMAIL","destination":"me@demo.co","code":"123456","profile":{"firstName":"Aymen"}}'
 *   curl :4830/users/me -H 'authorization: Bearer <token>'
 */
import express from 'express'
import { createOtpService, createInMemoryOtpStore } from '@authkit/otp'

// One-time declaration merge so Express's Request knows about the `auth`
// field the authkit middleware attaches. Every consumer app adds this once
// (documented in docs/INTEGRATION.md) — @authkit/express itself deliberately
// carries no @types/express dependency.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; claims: Record<string, unknown> }
    }
  }
}
import {
  createAuthService,
  createInMemoryUserStore,
  createInMemoryRotatingSessionStore,
} from '@authkit/core'
import {
  createAddressService,
  createInMemoryAddressStore,
  mapboxGeocoder,
  AddressError,
  type AddressInput,
  type Geocoder,
} from '@authkit/addresses'
import { createAuthMiddleware, createAuthHandlers, sendKitError } from '@authkit/express'

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

// Address extras demo: pretend-H3 cell (yuma would call @clustermap/core computeCells).
const addresses = createAddressService<{ cell: string }>({
  store: createInMemoryAddressStore(),
  hooks: { buildExtra: (i) => ({ cell: `demo-cell:${i.lat.toFixed(3)},${i.lng.toFixed(3)}` }) },
})

// Real Mapbox when a token is provided, canned suggestions otherwise.
const geocoder: Geocoder = process.env.MAPBOX_TOKEN
  ? mapboxGeocoder({ accessToken: process.env.MAPBOX_TOKEN, country: 'de', language: 'de' })
  : {
      autocomplete: async (q) => [
        {
          label: `${q} 12, 12203 Berlin, Germany`,
          lat: 52.52,
          lng: 13.405,
          placeId: 'demo.1',
          parts: { street: q, houseNumber: '12', postalCode: '12203', city: 'Berlin', countryCode: 'DE' },
        },
      ],
      reverse: async (lat, lng) => ({ label: `Somewhere near ${lat},${lng}`, lat, lng }),
    }

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

// Address book (composition example: auth middleware + addresses service).
app.get('/me/addresses', requireAuth, async (req, res) => {
  res.json({ data: await addresses.list(req.auth!.userId) })
})
app.post('/me/addresses', requireAuth, async (req, res) => {
  try {
    res.json({ data: await addresses.create(req.auth!.userId, req.body as AddressInput) })
  } catch (e) {
    sendKitError(res, e)
  }
})
app.post('/me/addresses/:id/default', requireAuth, async (req, res) => {
  try {
    res.json({ data: await addresses.setDefault(req.auth!.userId, req.params.id) })
  } catch (e) {
    if (e instanceof AddressError) res.status(e.status).json({ error: { code: e.code, message: e.message } })
    else sendKitError(res, e)
  }
})
app.delete('/me/addresses/:id', requireAuth, async (req, res) => {
  try {
    await addresses.remove(req.auth!.userId, req.params.id)
    res.status(204).send()
  } catch (e) {
    sendKitError(res, e)
  }
})

app.get('/geocoding/autocomplete', async (req, res) => {
  res.json({ data: await geocoder.autocomplete(String(req.query.q ?? '')) })
})

const PORT = Number(process.env.PORT ?? 4830)
app.listen(PORT, () => {
  console.log(`auth-kit demo → http://localhost:${PORT} (OTP dev code: 123456)`)
})
