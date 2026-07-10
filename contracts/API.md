# auth-kit — HTTP contract

The wire shapes every backend exposes (via `@authkit/express` or hand-rolled)
and every client (Flutter, web) implements. Payloads may be wrapped in the
app's envelope (yuma/lineo: `{ "data": … }`).

## Errors

`{ "error": { "code": "<CODE>", "message": "<human text>" } }` with the HTTP status:

| Code | Status | Meaning |
| --- | --- | --- |
| `INVALID_DESTINATION` | 400 | Malformed email/phone. |
| `COOLDOWN` | 429 | Re-requested a code too fast (message contains wait seconds). |
| `EXPIRED` | 401 | Code expired/consumed/absent — request a new one. |
| `TOO_MANY_ATTEMPTS` | 429 | Attempt cap hit — request a new code. |
| `INVALID_CODE` | 401 | Wrong code (attempt counted). |
| `INVALID_TOKEN` | 401 | Missing/invalid/expired access or refresh JWT. |
| `SESSION_REVOKED` | 401 | Refresh token replayed/rotated-out/superseded → re-login. |
| `CONTACT_TAKEN` | 409 | Email/phone already belongs to another account. |
| `INVALID_CREDENTIALS` | 401 | Password login failed (never says which part). |

## Endpoints (canonical paths — apps may remap)

### `POST /auth/otp/request` — `{ channel: "EMAIL"|"PHONE", destination }`
→ `{ expiresInSeconds, sent }` (`sent:false` in dev-code mode).

### `POST /auth/otp/verify` — `{ channel, destination, code, profile? }`
Login AND registration: verifies the code, **finds or creates** the user
(`profile` used only for first-timers). →

```jsonc
{
  "user": { "id": "…", "email": "…"|null, "phone": "…"|null, "profile": { /* app shape */ } },
  "token": "<access JWT>",          // Authorization: Bearer <token>
  "refreshToken": "<refresh JWT>",
  "expiresInSeconds": 900,           // access TTL
  "isNewUser": true|false
}
```

### `POST /auth/provider` — `{ provider: "google"|"apple", idToken, profile? }`
Verifies the provider ID token (JWKS), links or creates the account → same
session payload as above.

### `POST /auth/refresh` — `{ refreshToken }`
→ `{ token, refreshToken, expiresInSeconds }`.
- **rotating** apps (yuma): `refreshToken` is NEW; the used one is dead — replay
  → `SESSION_REVOKED`. Store the new one atomically.
- **static** apps (lineo): `refreshToken` is the SAME one back; keep using it.

### `POST /auth/logout` — `{ refreshToken }` → `{ ok: true }` (always 200).

### `POST /users/me/contact/request` (authed) — `{ channel, destination }`
Sends a code to the NEW email/phone (proves control). 409 if taken.

### `POST /users/me/contact/verify` (authed) — `{ channel, destination, code }`
→ `{ user }` with the updated contact.

## Address book + geocoding

Moved to **location-kit** — see its `contracts/API.md`.

## Client rules

1. Send `Authorization: Bearer <token>` on authed calls; on 401 try ONE
   `/auth/refresh`, then re-login.
2. Rotating apps: persist the refresh token returned by every refresh.
3. `isNewUser: true` → route to the app's onboarding (profile completion,
   first address, …).
