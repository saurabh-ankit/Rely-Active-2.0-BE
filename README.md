# Rely Active API

Backend scaffold for **Rely Active**, a senior-living community operations
platform. Express 5 + TypeScript + Sequelize (MySQL) + zod — tooling and
infrastructure are wired up; no domain features exist yet.

## Stack

- Node 20+, TypeScript 5 (strict)
- Express 5 (async route handlers forward rejections to the error handler automatically)
- Sequelize 6 / sequelize-typescript, MySQL 8 (`mysql2`)
- umzug 3 for migrations (TypeScript migration files, run directly via `tsx`)
- zod for environment validation
- winston for logging, helmet + express-rate-limit + cors for hardening

## First-run setup

```bash
# from the repo root (rely-active/)
docker compose up -d mysql redis

cd rely-active-api
npm install
cp .env.example .env
npm run migrate:status   # no migrations yet — add your first with migrate:create
npm run dev              # http://localhost:3002
```

`src/config/env.ts` validates `process.env` with zod at import time and
refuses to boot on a missing/invalid value — there are no insecure fallback
defaults anywhere in this codebase.

Check the app is up:

```bash
curl localhost:3002/healthz   # liveness
curl localhost:3002/readyz    # readiness (pings the DB)
```

## Scripts

| Script                                                      | What it does                    |
| ------------------------------------------------------------ | -------------------------------- |
| `npm run dev`                                                | `tsx watch` dev server          |
| `npm run build`                                              | Type-checked compile to `dist/` |
| `npm start`                                                   | Run the compiled build          |
| `npm run typecheck`                                           | `tsc --noEmit`                  |
| `npm run lint` / `lint:fix`                                   | ESLint (flat config)            |
| `npm run format` / `format:check`                             | Prettier                        |
| `npm run migrate:up` / `down` / `status` / `create <name>`   | umzug migrations                |

## Layout

```
src/
├── index.ts          # bootstrap only: connect DB → listen → graceful shutdown
├── app.ts             # createApp(): Express app factory, no listen() — test-friendly
├── config/            # env.ts (zod-validated), logger.ts, db.ts, redis.ts
├── models/            # sequelize-typescript models — currently empty; baseModel.ts
│                       #   gives every future model a UUID primary key
├── migrations/         # umzug migrations — add your first with `migrate:create`
├── modules/            # feature-first: routes + controller + service (+ schema)
│   └── health/         # /healthz, /readyz
├── routes/index.ts     # mounts feature routers under /api/v1
├── middlewares/         # requestContext, httpLogger, rateLimit, error
├── utils/               # appError, response envelope, pagination
├── enums/               # shared TS enums as domain concepts appear
├── scripts/migrate.ts   # umzug CLI (up/down/status/create)
└── types/express.d.ts   # Express Request augmentation
```

## Conventions to keep as features are added

- **Feature-first modules.** Each feature gets `src/modules/<feature>/` with
  `*.routes.ts` (wiring + middleware), `*.controller.ts` (req/res only),
  `*.service.ts` (pure business logic — no `req`/`res`, easy to unit test
  later), and `*.schema.ts` (zod request schemas).
- **`app.ts` stays a pure factory.** No `listen()` in it — only
  `src/index.ts` calls `listen()` and owns process lifecycle
  (`SIGTERM`/`SIGINT` drain in-flight requests, then close the DB pool).
  This keeps the app mountable in a future test runner (Vitest + Supertest)
  with no refactor.
- **Schema changes go through migrations only.** No DDL at startup.
- **`process.env` is read in exactly one place** — `src/config/env.ts`. Every
  other module imports the parsed `env` object.
- **Response envelope:** `{ success, message, data, meta? }` on success,
  `{ success: false, message, code?, errors? }` on error — see
  `src/utils/response.ts`.

See `PROJECT.md` at the repo root for the product/domain context this API
will grow into.
