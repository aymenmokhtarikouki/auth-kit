# @aymenkits/auth-otp

OTP engine: generate → bcrypt-hash → store → verify/consume, with TTL, attempt caps, resend cooldown and a dev master-code mode. Channel-agnostic (EMAIL / PHONE).

## Install

```bash
npm install @aymenkits/auth-otp
```

Installs with it: `bcryptjs` (automatic dependency).

## You provide

- `OtpStore` — one table on YOUR schema (create / findLatest / incrementAttempts / consume)
- `OtpSender` — how codes go out; structural adapters for your existing Twilio client / SMTP transporter are included, the clients are yours

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import { createOtpService, channelRouter } from '@aymenkits/auth-otp'

const otp = createOtpService({ store, sender: channelRouter({ PHONE: sms, EMAIL: mail }) })
await otp.request('PHONE', '+4915112345678')
await otp.verify('PHONE', '+4915112345678', '123456')
```

## Pairs with

- `@aymenkits/auth-core` consumes it for OTP login/registration
- usable standalone (contact-change verification, step-up auth)

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/auth-kit (`contracts/`, `docs/`).

## License

MIT
