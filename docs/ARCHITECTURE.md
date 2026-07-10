# Architecture

For wiring recipes see [`INTEGRATION.md`](INTEGRATION.md); for wire shapes see
[`../contracts/API.md`](../contracts/API.md).

## The one design rule

**The kit owns behavior; the app owns storage.** Every package exposes small
store interfaces the app implements on its OWN schema. No ORM, no migrations,
no table ownership in the kit — which is also the migration story: yuma's
stores map to its existing Prisma models, lineo's to its existing pg tables,
and because tokens are jsonwebtoken HS256 with YOUR secrets, sessions issued
before adoption keep working.

```
Flutter / web client
      │  contracts/API.md
      ▼
@authkit/express   (middleware + handlers, Express 4/5, envelope-agnostic)
      ▼
@authkit/core      (flows: OTP login, providers, sessions, contact change)
   │        │
   │        ├──► @authkit/otp   (code lifecycle)──► OtpStore / OtpSender   (app)
   │        └──► IdTokenVerifier (google/apple JWKS)
   ▼
UserStore / SessionStore                                                (app)

@authkit/addresses (sibling, NOT a dependency of core)
   └──► AddressStore / Geocoder                                          (app)
```

## OTP-first identity

`requestOtp` → code generated (crypto), **bcrypt-hashed**, stored, delivered
(or dev-code short-circuit: fixed code, nothing sent). `verifyOtp` → hash
compare with attempt counting → **find-or-create** by the verified email/phone
→ session. Registration is not a separate module: it's this flow plus your
`onUserCreated` hook (create app profile, first address, salon onboarding…).

Guarantees: TTL (default 10 min), max attempts (5) after which even the right
code is rejected, resend cooldown (60 s) with `retryAfterSeconds`, plaintext
codes never stored, normalization (email lowercase, phone stripped) applied on
BOTH request and verify.

## Sessions — two real strategies, one interface

| | `rotating` (yuma) | `static` (lineo) |
| --- | --- | --- |
| Store | one row per live session (`jti`, expiry) | one token column on the user |
| Refresh | verify JWT → jti active? → revoke it, issue NEW pair | verify JWT → equals stored? → new ACCESS only, same refresh |
| Replay of used token | `SESSION_REVOKED` (theft detection) | n/a (token is long-lived by design) |
| Devices | many concurrent | one (new login supersedes) |
| Why | web + mobile, stricter security | avoids rotate-desync on flaky mobile networks |

Both are first-class because both are deliberate production choices — the kit
doesn't pick a winner, the app does (per its `SessionStrategy` config).

## Provider sign-in (Google & Apple)

Both reduce to *verify a provider-signed JWT against their JWKS* (`jose`,
lazily imported so CJS apps work): issuer + audience (your client ids) checked,
then: ① linked account? sign in. ② same email exists? link provider to it.
③ else create + link (`isNewUser: true`). The `IdTokenVerifier` seam means
lineo can keep firebase-admin verification unchanged, and web redirect OAuth
(yuma's passport flow) feeds its callback `id_token` into the same function —
the kit never needs Express sessions or redirect plumbing.

## Contact change (OTP-verified)

Generalized from yuma's production flow: request sends the code to the NEW
destination (proving control), taken-destination checks run at request AND
confirm (race window), and the same OTP engine enforces TTL/attempts — one
security surface, not two.

## Addresses: included, but composed

The address book repeats in every app, so it's IN the kit — but as a sibling
package, not inside auth: identity works without it and future apps can skip
it. It owns the behavior apps keep rewriting: first-address-auto-default,
default flipping, default-deletion promotion, coordinate validation, and
`buildExtra` — recompute app fields when coordinates change (yuma: H3 cells
via `@clustermap/core`'s `computeCells`; synergy, not coupling). The Mapbox
geocoder adapter (server-side, token never reaches clients, pre-split address
parts) is the lineo proxy both apps were already duplicating.

## What deliberately is NOT here

Passwords as a requirement (optional compat only) · address shapes in auth ·
role enums / profile schemas (generic `Profile` + `Claims`) · rate limiting
implementation (app middleware slot) · FCM/push · passport redirect wiring.
