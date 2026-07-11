# @authkit/express

Express 4/5 middleware (requireAuth / optionalAuth / requireRole) and route factories for the standard auth endpoints. Envelope-agnostic, structural typing — no express dependency.

## Install

```bash
npm install @authkit/express
```

Installs with it: `@authkit/core`, `@authkit/otp` (automatic dependencies).

## You provide

- Your Express app/router
- The flows/token service from `@authkit/core`
- Optionally your rate limiter (seam)

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import { createAuthMiddleware } from '@authkit/express'

const { requireAuth } = createAuthMiddleware({ tokens })
router.get('/users/me', requireAuth, meHandler)
```

## Pairs with

- Downstream kit handlers (@reviewkit/@chatkit/@notifykit express) read the `req.auth.userId` this middleware sets

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/auth-kit (`contracts/`, `docs/`).

## License

UNLICENSED — published for use by the author's applications.
