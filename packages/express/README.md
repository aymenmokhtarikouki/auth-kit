# @aymenkits/auth-express

Express 4/5 middleware (requireAuth / optionalAuth / requireRole) and route factories for the standard auth endpoints. Envelope-agnostic, structural typing — no express dependency.

## Install

```bash
npm install @aymenkits/auth-express
```

Installs with it: `@aymenkits/auth-core`, `@aymenkits/auth-otp` (automatic dependencies).

## You provide

- Your Express app/router
- The flows/token service from `@aymenkits/auth-core`
- Optionally your rate limiter (seam)

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import { createAuthMiddleware } from '@aymenkits/auth-express'

const { requireAuth } = createAuthMiddleware({ tokens })
router.get('/users/me', requireAuth, meHandler)
```

## Pairs with

- Downstream kit handlers (@aymenkits/review-express, chat-express, notify-express) read the `req.auth.userId` this middleware sets

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/auth-kit (`contracts/`, `docs/`).

## License

MIT
