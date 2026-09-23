# @aymenkits/auth-core

OTP-first identity: token service (JWT HS256, drop-in compatible with hand-rolled jsonwebtoken apps), rotating OR static refresh strategies (rotating takes an `onReplay` scope), password login (optional), Google/Apple ID-token sign-in, GitHub access-token sign-in, find-or-create flows and OTP-verified contact change.

## Install

```bash
npm install @aymenkits/auth-core
```

Installs with it: `@aymenkits/auth-otp`, `bcryptjs`, `jsonwebtoken`, `jose` (automatic dependencies).

## You provide

- `UserStore` — find/create users on YOUR schema (profile shape is yours)
- `SessionStore` — refresh-token persistence (a table or a single column, per strategy)
- Your JWT secrets — keeping them means existing tokens stay valid

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import { createAuthService, googleIdTokenVerifier } from '@aymenkits/auth-core'

const auth = createAuthService({
  users,                                          // your UserStore
  session: { mode: 'rotating', store: sessions }, // or { mode: 'static', store }
  tokens: { accessSecret, refreshSecret },
  otp,                                            // from @aymenkits/auth-otp
  providers: { google: googleIdTokenVerifier({ clientIds: [GOOGLE_CLIENT_ID] }) },
})
const session = await auth.verifyOtp({ channel: 'PHONE', destination, code })
```

## Provider sign-in and account linking

`signInWithProvider(provider, token)` signs in the account already linked to
that provider identity. Otherwise it links the account with the same e-mail,
but **only when the provider verified that address** (`emailVerified: true`).
Otherwise it creates a new account. An unverified address is dropped: the
sign-in gets an account of its own with `email: null`. A Google account that
carries someone else's address therefore can't open that person's account or
claim the address before they sign up.

A custom `IdTokenVerifier` must set `emailVerified: true` explicitly, because
omitted counts as unverified. This applies since 1.2.0; earlier versions
ignored the flag, so upgrade.

## Pairs with

- `@aymenkits/auth-express` for routes/middleware
- `@aymenkits/chat-socketio` accepts the TokenService as its handshake `identity`

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/auth-kit (`contracts/`, `docs/`).

## License

MIT
