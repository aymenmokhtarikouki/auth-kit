# Integrating auth-kit

## Install

```bash
npm install @authkit/otp                # standalone OTP engine
npm install @authkit/core               # identity: tokens, flows, providers
npm install @authkit/express            # optional middleware + route factories
```

## The migration guarantee: existing tokens stay valid

`createTokenService` signs/verifies HS256 JWTs with jsonwebtoken — the same
shape most hand-rolled apps use. **Keep your existing secrets** and every
access token issued before the swap keeps verifying. If your legacy payload
differs (e.g. `{ userId }` instead of `sub`), wrap verification in a
dual-accept: try the kit first, fall back to the legacy decode until the old
tokens age out.

## Implement the stores

- `OtpStore` — one table: destination, hashed code, expiry, attempts, used.
- `UserStore<Profile>` — find by email/phone/provider, create; `Profile` is
  whatever your app stores (names, roles…), carried through untouched.
- `SessionStore` — per strategy: `rotating` wants a refresh-token table
  (jti, revokedAt); `static` wants a single column on users.

## Choose a refresh strategy

Both are production shapes: `rotating` (multi-device, replay-safe) or
`static` (one token per user, no rotation). It's config, not a fork.

## Pairing with sibling kits

Kits pair **by shape, never by import** — every integration point is a
parameter interface a sibling kit satisfies structurally. Pass the real kit,
your own service, or a stub in tests.

- `@chatkit/socketio` accepts the TokenService as its handshake `identity`.
- Every kit's express handlers read the `req.auth.userId` that
  `@authkit/express` middleware sets.

## Migrating from an existing implementation

The kits were extracted from production systems, and these rules kept those
migrations safe:

1. **Never rewrite a working flow in one step.** Keep your endpoint URLs,
   response envelopes and (for realtime) socket event names byte-identical;
   swap the implementation underneath, one endpoint at a time.
2. **Data stays put.** The store seams map onto your existing tables — new
   capabilities need at most additive columns, never a data migration.
3. **Delete the superseded code in the same change.** Two implementations of
   the same behavior is how drift starts.
4. Where the kit enforces domain rules through policy hooks, your hooks may
   THROW your app's own error types — the kit re-throws them untouched, so
   your API's error contract survives the swap.
