# Rely Active Backend

Express and TypeScript foundation for the Rely Active 2.0 API.

Requires Node.js 24.19.0 LTS and pnpm 10.18.3. Run `nvm use` from this directory to select the pinned runtime.

## Setup

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Foundation routes are `GET /health`, `GET /api/v1`, `/api/v1/auth`, `/api/v1/examples`, and `/api/v1/company`.

## Database Connections & Server Startup Logs

When starting the server with `pnpm dev` / `npm run dev`, the server logs explicit status notifications:

- `✅ Database connected successfully!` when MySQL connection is authenticated.
- `✅ Database models synchronized successfully!` when Sequelize models sync.
- `🚀 Server started running on port http://localhost:3002` when Express & Socket.io server starts listening.

## Database Migrations & Model Policy

> **Mandatory Rule**: Every time a new domain model is created in `src/models`, a corresponding migration file **MUST** be created under `src/migrations/`.

### Migration Running Console Notifications

When running migrations (`pnpm migrate:up`), explicit console notifications are output:

- `✅ Database connected successfully for migrations!`
- `📌 Found X pending migration(s). Running migrations...`
- `🚀 Migration running finished successfully!`
- `✨ All migrations finished!`

### Migration Commands

```bash
# Create a new migration for a model (kebab-case name)
pnpm migrate:create -- create-my-new-table

# Check migration status (executed vs pending)
pnpm migrate:status

# Run all pending migrations
pnpm migrate:up

# Rollback last executed migration
pnpm migrate:down
```

### Company Migration File

- `src/migrations/20260826153000-create-company-tables.ts`: Creates `company` and `company_custom_fields` tables in MySQL with full schema definitions, foreign keys, comments, and soft-delete flags.

## Company Domain API

Company management has been aligned with Rely-Assist fields and Sequelize TypeScript models (`Company` & `CompanyCustomField`).

### Endpoints

- `POST /api/v1/company`: Create company record with multipart file uploads (`document`, `accountant_signature`, `documents` for custom fields) and JSON `customFields`.
- `GET /api/v1/company`: Fetch all active companies including associated custom fields.
- `GET /api/v1/company/:id`: Fetch company by ID with custom fields.
- `PUT /api/v1/company/:id`: Update company details, bank details, accountant signature, documents, and custom fields.
- `DELETE /api/v1/company/:id`: Soft-delete company record.
- `GET /api/v1/company/company-setup/status`: Check company setup status (`needsSetup`, `setupStep`, `message`, `hasCompany`, `hasLocation`).

## Static Media Uploads

Uploaded files (documents, logos, signatures) are stored in `uploads/` directory and served statically under `/uploads/filename`.

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before pushing.
