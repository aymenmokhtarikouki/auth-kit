# Integration guide

Same submodule pattern as clustermap-kit (see that repo's INTEGRATION.md for
the general submodule/deploy mechanics).

## 1. Add + build

```bash
git submodule add git@github.com:aymenmokhtarikouki/auth-kit.git vendor/auth-kit
npm --prefix vendor/auth-kit run setup     # install packages-only + build dist
```

`package.json` — **always include every `@authkit/*` package you import AND
`@authkit/otp` + `@authkit/core` when using express** (file: deps only exist
in-repo; npm 404s otherwise — same gotcha as clustermap):

```jsonc
"dependencies": {
  "@authkit/otp":     "file:vendor/auth-kit/packages/otp",
  "@authkit/core":    "file:vendor/auth-kit/packages/core",
  "@authkit/express": "file:vendor/auth-kit/packages/express"
},
"scripts": { "authkit:setup": "npm --prefix vendor/auth-kit run setup" }
```

TypeScript: add the one-time Request augmentation (see `examples/demo-server/server.ts` top).

## 2. Migration rules (KEEP EXISTING SESSIONS VALID)

1. **Reuse your current JWT secrets** in `tokens.accessSecret/refreshSecret`.
2. Match your current TTLs (`accessTtlSeconds`, `refreshTtlSeconds`).
3. Keep your `claims` shape identical to today's payload (lineo: role,
   isManager, activeSalonId… — provide them in the `claims` callback).
4. Adopt endpoint-by-endpoint behind the SAME URLs; stores read/write the
   SAME tables, so old and new code can coexist during the migration.

## 3. yuma_backend (Prisma) store recipes

```ts
// OtpStore → model OtpCode
const otpStore: OtpStore = {
  create: (d) => prisma.otpCode.create({ data: d }),
  findLatest: (channel, destination) =>
    prisma.otpCode.findFirst({ where: { channel, destination }, orderBy: { createdAt: 'desc' } }),
  incrementAttempts: (id) =>
    prisma.otpCode.update({ where: { id }, data: { attempts: { increment: 1 } } }).then(() => {}),
  consume: (id) =>
    prisma.otpCode.update({ where: { id }, data: { consumedAt: new Date() } }).then(() => {}),
}

// UserStore<Profile> → model User (+ OAuthAccount for providers)
//   findByEmail/Phone/Id → prisma.user.findUnique
//   findByProvider → prisma.oAuthAccount.findUnique({ provider_subject }) include user
//   create → prisma.user.create (profile.firstName/lastName/isConsumer)
//   linkProvider → prisma.oAuthAccount.create
//   updateContact → prisma.user.update  (the /users/me/contact flow)

// RotatingSessionStore → model RefreshToken
//   add → create { jti, userId, expiresAt } · isActive → find where revokedAt null & not expired
//   revoke → update { revokedAt: now } · revokeAllForUser → updateMany

// AddressStore recipes → see location-kit/docs/INTEGRATION.md
```

Sessions: `{ mode: 'rotating', store }`. OTP senders: wrap the existing
transactionalMailer + Twilio client with `smtpEmailSender` / `twilioSmsSender`.
`OTP_DEV_CODE` env → `options.devCode` (unset in prod, as today).

## 4. lineo-backend (raw pg) store recipes

```ts
// OtpStore → otp_codes table (NOTE: kit stores bcrypt hashes in `code`-like
// column — codes are 10-min-lived, so switching to hashed needs no migration;
// rename/reuse the column as code_hash.)
const otpStore: OtpStore = {
  create: async (d) => (await pool.query(
    `INSERT INTO otp_codes (channel, destination, code_hash, expires_at)
     VALUES ($1,$2,$3,$4) RETURNING *`, [d.channel, d.destination, d.codeHash, d.expiresAt],
  )).rows[0].map(rowToRecord),
  findLatest: async (c, dest) => …ORDER BY created_at DESC LIMIT 1…,
  …
}

// StaticSessionStore → users.refresh_token column (current model, unchanged)
const sessionStore: StaticSessionStore = {
  set: (userId, token) => pool.query(`UPDATE users SET refresh_token=$2 WHERE id=$1`, [userId, token]),
  get: async (userId) => (await pool.query(`SELECT refresh_token FROM users WHERE id=$1`, [userId])).rows[0]?.refresh_token ?? null,
}
// session: { mode: 'static', store: sessionStore }  ← deliberately no rotation

// Google: keep firebase-admin — any IdTokenVerifier plugs in:
const googleViaFirebase: IdTokenVerifier = {
  verify: async (t) => {
    const d = await admin.auth().verifyIdToken(t)
    return { provider: 'google', subject: d.uid, email: d.email?.toLowerCase() ?? null, emailVerified: !!d.email_verified, name: d.name ?? null }
  },
}

// claims: (u) => ({ role: u.profile.role, isManager: …, activeSalonId: … })
// hooks.onUserCreated: stylist/salon-code branch, login_history insert via onLogin
```

## 5. Flutter apps

No package — implement [`contracts/API.md`](../contracts/API.md). Yuma's
existing auth endpoints already match the OTP + refresh shapes closely.

## 6. Update flow

```bash
cd vendor/auth-kit && git pull origin main && cd ../.. \
  && npm run authkit:setup && git add vendor/auth-kit && git commit -m "chore: bump auth-kit"
```

Deploys/CI: `git submodule update --init` + `npm run authkit:setup` BEFORE the
consumer `npm install` (yuma's deploy.sh already does this for clustermap —
add the same line for auth-kit).
