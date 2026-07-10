# auth-kit

Shared identity toolkit for yuma, lineo and future apps. **OTP-first**: email/
phone codes are the primary login *and* registration (verify = find-or-create) —
no passwords required anywhere. Google & Apple sign-in via ID-token verification
with account linking. Storage-agnostic: the kit owns **behavior**, your app owns
its tables through small store interfaces (Prisma in yuma, raw pg in lineo —
same pattern as clustermap-kit).

Consume as a **git submodule** at `vendor/auth-kit` with `file:` dependencies.

## Packages

| Package | What | Deps |
| --- | --- | --- |
| `@authkit/otp` | Code engine: generate → bcrypt-hash → deliver → verify. TTL, attempt cap, resend cooldown, dev master code. Seams: `OtpStore`, `OtpSender` (+ ready SMTP/Twilio adapter factories that take YOUR configured client). | bcryptjs |
| `@authkit/core` | Sessions & flows: OTP login/registration, Google/Apple (`IdTokenVerifier` via JWKS), optional password compat, JWT access tokens with app claims, **pluggable refresh** — `rotating` (multi-device, yuma) or `static` (single token, no rotation, lineo) — OTP-verified contact change, `onUserCreated`/`onLogin` hooks. Seams: `UserStore<Profile>`, session stores. | otp, jsonwebtoken, jose, bcryptjs |
| `@authkit/express` | Express 4/5 middleware (`requireAuth`, `optionalAuth`, `requireClaims`), standard endpoint handlers, kit-error→HTTP mapping. Envelope-agnostic. | core, otp |

> The **address book + geocoding** moved to their own repo —
> [location-kit](https://github.com/aymenmokhtarikouki/location-kit)
> (`@locationkit/addresses`). Identity and location are independent kits that
> compose in your endpoints.

## Documentation

| Doc | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Flow diagrams, session strategies, provider verification, design decisions (why addresses are separate, why no password requirement). |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | Submodule setup, store recipes for yuma (Prisma) and lineo (pg), migration rules that keep existing tokens valid. |
| [`contracts/API.md`](contracts/API.md) | The HTTP contract — Flutter/web clients implement the same shapes. |

## Quick start (backend)

```ts
const otp = createOtpService({
  store: myOtpStore, // maps to your otp table
  sender: channelRouter({
    EMAIL: smtpEmailSender(transporter, { from: 'no-reply@app.com' }),
    PHONE: twilioSmsSender(twilioClient, { from: '+1...' }),
  }),
  options: { devCode: process.env.OTP_DEV_CODE }, // dev only
})

const auth = createAuthService<Profile, Claims>({
  users: myUserStore,
  otp,
  session: { mode: 'rotating', store: myRefreshStore }, // or 'static'
  tokens: { accessSecret, refreshSecret },               // keep your EXISTING secrets
  providers: {
    google: googleIdTokenVerifier({ clientIds: [GOOGLE_CLIENT_ID] }),
    apple: appleIdTokenVerifier({ clientIds: [APPLE_SERVICE_ID] }),
  },
  claims: (u) => ({ role: u.profile.role }),
  hooks: { onUserCreated: (u) => createAppProfile(u) }, // attach addresses etc. HERE
})

const { requireAuth } = createAuthMiddleware(auth)
const handlers = createAuthHandlers(auth, { wrapResponse: (d) => createApiResponse(d) })
router.post('/auth/otp/request', handlers.otpRequest)
router.post('/auth/otp/verify', handlers.otpVerify)
router.post('/auth/provider', handlers.providerSignIn)
router.post('/auth/refresh', handlers.refresh)
```

## Demo (no external services)

```bash
npm install
npm run demo            # http://localhost:4830 — OTP dev code 123456
```

Exercises every flow: OTP login, `/users/me`, refresh rotation + replay
rejection, contact change.

## Development

```bash
npm install && npm test      # unit tests
npm run build                # tsc builds for all packages
npm run setup                # consumer one-liner: install packages-only + build
```

## Design rules (short version)

- **Identity ≠ profile ≠ address.** Auth core knows email/phone/providers/
  sessions. Names ride through the generic `Profile` payload. Addresses live
  in **location-kit** and compose in the app's endpoint — never a dependency
  of auth.
- **Migration-safe by construction:** stores map onto EXISTING tables, and the
  kit uses jsonwebtoken HS256 like both apps — keep your secrets and current
  tokens stay valid.
- A module must own **behavior**, not just columns.
