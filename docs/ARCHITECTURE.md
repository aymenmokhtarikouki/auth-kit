# Architecture

For wiring recipes see [`INTEGRATION.md`](INTEGRATION.md); for wire shapes see
[`../contracts/API.md`](../contracts/API.md).

## The one design rule

**The kit owns behavior; the app owns storage.** Every package exposes small
store interfaces the app implements on its OWN schema. No ORM, no migrations,
no table ownership in the kit — which is also the migration story: your
stores map to your existing models and tables,
and because tokens are jsonwebtoken HS256 with YOUR secrets, sessions issued
before adoption keep working.

```
Flutter / web client
      │  contracts/API.md
      ▼
@aymenkits/auth-express   (middleware + handlers, Express 4/5, envelope-agnostic)
      ▼
@aymenkits/auth-core      (flows: OTP login, providers, sessions, contact change)
   │        │
   │        ├──► @aymenkits/auth-otp   (code lifecycle)──► OtpStore / OtpSender   (app)
   │        └──► IdTokenVerifier (google/apple JWKS)
   ▼
UserStore / SessionStore                                                (app)
```

(The address book + geocoding live in the separate **location-kit** repo —
identity and location are independent domains that compose in app endpoints.)

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

| | `rotating` | `static` |
| --- | --- | --- |
| Store | one row per live session (`jti`, expiry) | one token column on the user |
| Refresh | verify JWT → jti active? → revoke it, issue NEW pair | verify JWT → equals stored? → new ACCESS only, same refresh |
| Replay of used token | `SESSION_REVOKED` (theft detection — see below) | n/a (token is long-lived by design) |
| Devices | many concurrent | one (new login supersedes) |
| Why | web + mobile, stricter security | avoids rotate-desync on flaky mobile networks |

Both are first-class because both are deliberate production choices — the kit
doesn't pick a winner, the app does (per its `SessionStrategy` config).

### How far a replay reaches — `onReplay`

A refresh token whose signature verifies but whose `jti` is no longer active
was already rotated out, so a copy is in circulation. How wide the response
goes is the deployment's call:

| `onReplay` | Effect | For |
| --- | --- | --- |
| `'user'` *(default)* | `revokeAllForUser` — every session, every device | One human, one session. Assume theft, fail closed. |
| `'session'` | revoke the replayed `jti` only; siblings live on | Several instances legitimately signed in to one account |

The default is deliberately the wide one: a stolen refresh token is a real
compromise and the safe reading is to end every session. But it is *too* wide
for a fleet. Measured on a five-instance test fleet, all independently signed
in to one account: the instances raced on refresh, one loser replayed a stale
token, and `revokeAllForUser` signed out all five — **including the operator's
own machine, which had done nothing wrong**. `'session'` narrows the blast
radius to the session that actually replayed.

It is strictly weaker — a genuine thief keeps their other stolen sessions — so
it is opt-in, and a deployment choosing it is saying *"concurrent sessions for
one account are expected here"*. Consumers that expose it through config should
refuse it in production (katharina-api's `AUTH_REPLAY_SCOPE` does, the same way
it refuses `OTP_DEV_CODE`).

## Provider sign-in (Google, Apple & GitHub)

**Google and Apple** reduce to *verify a provider-signed JWT against their JWKS*
(`jose`, lazily imported so CJS apps work): issuer + audience (your client ids)
checked, then: ① linked account? sign in. ② same email exists? link provider to
it. ③ else create + link (`isNewUser: true`). The `IdTokenVerifier` seam means
apps on firebase-admin keep their verification unchanged, and web redirect OAuth
(a passport flow) feeds its callback `id_token` into the same function —
the kit never needs Express sessions or redirect plumbing.

**GitHub is different in kind, not degree.** A GitHub OAuth App issues no OIDC
ID token at all; the client ends up holding an opaque **access token**, which
carries no signature to verify and — critically — **no audience**. Verifying it
by calling `/user` and trusting the answer would accept a token issued to *any
other app*: every other site running "Sign in with GitHub" also receives its
users' tokens, and a malicious one could replay a collected token here and be
signed in as that user. That is OAuth token substitution, the confused-deputy
hole, and it is why an access-token login is never just a Bearer call.

So `githubAccessTokenVerifier` asks GitHub twice, in this order:

1. **Audience.** POST the token to `/applications/{client_id}/token` under the
   app's own `client_id:client_secret` Basic auth. GitHub answers 200 only when
   the token belongs to *that* app — the check the token cannot carry itself.
   Mandatory, not optional: a verifier that silently accepts other apps' tokens
   is worse than none, because it looks like it works.
2. **Identity.** `GET /user` → the subject is the numeric `id`, never `login`
   (logins are reusable after a rename, so keying on one hands the account to
   whoever claims the freed name). Then `GET /user/emails` for the primary
   verified address, since the public-profile email is null for most accounts.
   A token without the `user:email` scope still signs in, with no email rather
   than an error — the account still has a stable subject to key on.

```ts
github: githubAccessTokenVerifier({ clientId, clientSecret }),
// GitHub Enterprise Server: pass apiBaseUrl
```

## Contact change (OTP-verified)

Generalized from a production flow: request sends the code to the NEW
destination (proving control), taken-destination checks run at request AND
confirm (race window), and the same OTP engine enforces TTL/attempts — one
security surface, not two.

## What deliberately is NOT here

Passwords as a requirement (optional compat only) · addresses/geolocation
(→ location-kit) · role enums / profile schemas (generic `Profile` + `Claims`)
· rate limiting implementation (app middleware slot) · FCM/push · passport
redirect wiring.
