# @aymenkits/auth-core

OTP-first identity: token service (JWT HS256, drop-in compatible with hand-rolled jsonwebtoken apps), rotating OR static refresh strategies, password login (optional), Google/Apple ID-token sign-in, find-or-create flows and OTP-verified contact change.

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
import { createTokenService, createAuthFlows } from '@aymenkits/auth-core'

const tokens = createTokenService({ accessSecret, refreshSecret })
const auth = createAuthFlows({ users, sessions, tokens, otp, strategy: 'rotating' })
const session = await auth.verifyOtp({ channel: 'PHONE', destination, code })
```

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
