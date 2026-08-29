# Rely Active Backend

Express and TypeScript foundation for the Rely Active 2.0 API.

Requires Node.js 24.19.0 LTS and pnpm 10.18.3. Run `nvm use` from this directory to select the pinned runtime.

## Setup

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Foundation routes are `GET /health`, `GET /api/v1`, `/api/v1/auth`, `/api/v1/examples`, `/api/v1/company`, `/api/v1/property`, `/api/v1/users`, `/api/v1/roles`, `/api/v1/resources`, and `/api/v1/permissions`.

---

## Mandatory Backend Module Architecture & Standards

All new feature modules added to Rely-Active-2.0-BE **MUST** strictly follow the layered folder layout and end-to-end development workflow detailed below.

### 1. Folder Structure Standard

Every domain module (e.g., `company`, `property`, `user`, `role`, `resident`) must follow this directory structure:

```text
src/
├── migrations/                        # Database schema migrations (Sequelize CLI)
│   ├── 20260826153000-create-company-tables.ts
│   ├── 20260826180000-create-property-tables.ts
│   └── <timestamp>-create-<module>-table.ts
├── models/                            # Sequelize ORM TypeScript Models
│   ├── company.model.ts
│   ├── property.model.ts
│   └── <module>.model.ts
├── types/                             # Domain DTOs, Payload & Request Interfaces
│   ├── company.ts
│   ├── property.ts
│   └── <module>.ts
├── validations/                       # Zod Request Validation Schemas
│   ├── company.validation.ts
│   ├── property.validation.ts
│   └── <module>.validation.ts
├── services/                          # Business Logic & Database Operations
│   ├── company.service.ts
│   ├── property.service.ts
│   └── <module>.service.ts
└── web-app/                           # Web API Layer
    ├── controllers/                   # HTTP Request Controllers
    │   ├── company.controller.ts
    │   ├── property.controller.ts
    │   └── <module>.controller.ts
    └── routes/                        # Express Route Definitions
        ├── company.routes.ts
        ├── property.routes.ts
        ├── <module>.routes.ts
        └── index.ts                   # Central Router Registry
```

---

### 2. End-to-End Workflow for Creating a New Module

When implementing a new module, developers **MUST** follow this exact step-by-step sequence:

```text
1. Migration  ──►  2. Model  ──►  3. Types  ──►  4. Validation  ──►  5. Service  ──►  6. Controller  ──►  7. Route
```

#### Step 1: Create Database Migration (`src/migrations/`)

> **Mandatory Rule**: Every database schema change or model addition **MUST** have a corresponding migration script.

```bash
pnpm migrate:create -- create-my-new-table
```

#### Step 2: Define Sequelize Model (`src/models/<module>.model.ts`)

Define the Sequelize TypeScript model class, attributes interface, and field column annotations matching the database schema.

#### Step 3: Define Types & Interfaces (`src/types/<module>.ts`)

Define input payloads, create/update DTOs, query parameters, and service return types.

#### Step 4: Define Request Validation Schemas (`src/validations/<module>.validation.ts`)

Create Zod schemas for validating HTTP request bodies, params, and query string arguments.

```typescript
import { z } from 'zod'

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_REGEX = /^[6-9][0-9]{9}$/

export const createModuleSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    contact_number: z.string().regex(PHONE_REGEX, 'Contact number must start with 6-9 and be 10 digits'),
    email: z.string().email('Invalid email address').optional(),
  })
  .passthrough()

export const updateModuleSchema = createModuleSchema.partial().passthrough()
```

#### Step 5: Implement Service (`src/services/<module>.service.ts`)

Implement business logic, ORM queries, transactional operations, and data transformations.

```typescript
import { ModuleModel } from '@/models/module.model'
import type { CreateModuleInput } from '@/types/module'

export class ModuleService {
  async getAll() {
    return await ModuleModel.findAll({ where: { is_deleted: false } })
  }

  async create(data: CreateModuleInput) {
    return await ModuleModel.create(data)
  }
}
```

#### Step 6: Create Controller (`src/web-app/controllers/<module>.controller.ts`)

Extract parameters, delegate execution to the service layer, and return standardized JSON responses.

```typescript
import { Request, Response } from 'express'
import { ModuleService } from '@/services/module.service'

const service = new ModuleService()

export const getModules = async (req: Request, res: Response) => {
  const result = await service.getAll()
  return res.status(200).json({ success: true, data: result })
}
```

#### Step 7: Define Routes & Register Router (`src/web-app/routes/<module>.routes.ts`)

Connect validation middleware, authentication guards, and controller handler methods. Then register the module router in `src/web-app/routes/index.ts`.

```typescript
import { Router } from 'express'
import { getModules, createModule } from '../controllers/module.controller'
import { validateRequest } from '@/middlewares/validateRequest'
import { createModuleSchema } from '@/validations/module.validation'

const router = Router()

router.get('/', getModules)
router.post('/', validateRequest(createModuleSchema), createModule)

export default router
```

---

## Database Connections & Server Startup Logs

When starting the server with `pnpm dev` / `npm run dev`, the server logs explicit status notifications:

- `✅ Database connected successfully!` when MySQL connection is authenticated.
- `✅ Database models synchronized successfully!` when Sequelize models sync.
- `🚀 Server started running on port http://localhost:3002` when Express & Socket.io server starts listening.

---

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

### Migration History & Executed Scripts

- `src/migrations/20260826153000-create-company-tables.ts`: Creates `company` and `company_custom_fields` tables in MySQL with full schema definitions, foreign keys, comments, and soft-delete flags.
- `src/migrations/20260826180000-create-property-tables.ts`: Creates `properties`, `property_blocks`, `property_floors`, and `property_units` tables establishing the 4-tier hierarchy.
- `src/migrations/20260827120000-remove-upcoming-property-status.ts`: Updates property status options by removing upcoming status.
- `src/migrations/20260827123000-drop-status-column-from-properties.ts`: Drops property `status` column from `properties` table (Property-level status removed completely; unit-level status `available`, `booked`, `sold` retained).

---

## Company Domain API

Company management is aligned with Rely-Assist fields and Sequelize TypeScript models (`Company` & `CompanyCustomField`).

### Endpoints

- `POST /api/v1/company`: Create company record with multipart file uploads (`document`, `accountant_signature`, `documents` for custom fields) and JSON `customFields`.
- `GET /api/v1/company`: Fetch all active companies including associated custom fields.
- `GET /api/v1/company/:id`: Fetch company by ID with custom fields.
- `PUT /api/v1/company/:id`: Update company details, bank details, accountant signature, documents, and custom fields.
- `DELETE /api/v1/company/:id`: Soft-delete company record.
- `GET /api/v1/company/company-setup/status`: Check company setup status (`needsSetup`, `setupStep`, `message`, `hasCompany`, `hasLocation`).

---

## Property Creation & Structure Domain API

The Property module provides full CRUD and structural hierarchy management for residential real estate projects.

### Domain Hierarchy

```text
Company (companyId)
  └── Property (Project level with address & amenities)
        └── PropertyBlock (Block / Tower e.g. "Tower A")
              └── PropertyFloor (Floor e.g. "Ground Floor", "1st Floor")
                    └── PropertyUnit (Individual unit e.g. "A-101", 2BHK, Area)
```

### Key Schema Updates

- **Property Status Removal**: Property-level status (`status`) has been removed from models, controllers, and database schema via migration.
- **Unit Hierarchy**: Supports customizable Unit Nomenclature Templates (e.g. `{{TowerPrefix}}-{{FloorNumber}}{{Position}}`), disabled template preview inputs, and unit-level statuses (`available`, `booked`, `sold`).

### Endpoints

- `POST /api/v1/property`: Create property with optional full nested hierarchy (`blocks` → `floors` → `units`). Automatically resolves active company.
- `GET /api/v1/property`: Fetch all active properties with full nested hierarchy (supports optional `?companyId=` query filter).
- `GET /api/v1/property/:id`: Fetch single property by ID with complete block, floor, and unit tree.
- `PUT /api/v1/property/:id`: Update property details and re-create active tower blocks, floors, and units.
- `DELETE /api/v1/property/:id`: Soft-delete property.
- `POST /api/v1/property/:id/blocks`: Add a block/tower to an existing property.
- `POST /api/v1/property/blocks/:blockId/floors`: Add a floor to an existing block.
- `POST /api/v1/property/floors/:floorId/units`: Add a unit to an existing floor.

---

## Static Media Uploads

Uploaded files (documents, logos, signatures) are stored in `uploads/` directory and served statically under `/uploads/filename`.

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before pushing.
