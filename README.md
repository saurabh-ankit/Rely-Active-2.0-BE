# Rely Active Backend

Express and TypeScript foundation for the Rely Active 2.0 API.

Requires Node.js 24.19.0 LTS and pnpm 10.18.3. Run `nvm use` from this directory to select the pinned runtime.

## Setup

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Foundation routes are `GET /health`, `GET /api/v1`, `/api/v1/auth`, and `/api/v1/examples`. The example repository is intentionally in-memory; connect persistence when the first Active domain is introduced.

## Database migrations

Umzug uses the configured MySQL `DATABASE_URL`, Sequelize's query interface, migration files in `src/migrations`, and the `sequelize_meta` tracking table.
Migration identities are stored without `.ts` or `.js`; existing Assist-style metadata names with either extension remain recognized and rollback-compatible.

```bash
pnpm migrate:status
pnpm migrate:up
pnpm migrate:down
pnpm migrate:create -- add-community-table
```

Migration names must use kebab-case. Every migration must provide reversible `up` and `down` functions.

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before pushing. Husky runs lint-staged on commit and the verification suite on push.
