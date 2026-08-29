# Rely Active Backend

Express and TypeScript foundation for the Rely Active 2.0 API.

Requires Node.js 24.19.0 LTS and pnpm 10.18.3. Run `nvm use` from this directory to select the pinned runtime.

## Setup

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Foundation routes are `GET /health`, `GET /api/v1`, `/api/v1/auth`, `/api/v1/examples`, `/api/v1/company`, `/api/v1/property`, `/api/v1/users`, `/api/v1/roles`, `/api/v1/resources`, `/api/v1/permissions`, `/api/v1/departments`, and `/api/v1/residents`.

---

## Mandatory Backend Module Architecture & Standards

All new feature modules added to Rely-Active-2.0-BE **MUST** strictly follow the layered folder layout and end-to-end development workflow detailed below.

### 1. Folder Structure Standard

Every domain module (e.g., `company`, `property`, `user`, `role`, `resident`) must follow this directory structure:

```text
src/
├── migrations/                        # Master Database Migrations
│   ├── 20260826120000-create-initial-schema.ts
│   └── 20260827160000-seed-initial-data.ts
├── models/                            # Sequelize ORM TypeScript Models
│   ├── company.model.ts
│   ├── property.model.ts
│   ├── resident.model.ts
│   └── residentFamilyMember.model.ts
├── types/                             # Domain DTOs, Payload & Request Interfaces
│   ├── company.ts
│   ├── property.ts
│   └── resident.ts
├── validations/                       # Zod Request Validation Schemas
│   ├── company.validation.ts
│   ├── property.validation.ts
│   └── resident.validation.ts
├── services/                          # Business Logic & Database Operations
│   ├── company.service.ts
│   ├── property.service.ts
│   └── resident.service.ts
└── web-app/                           # Web API Layer
    ├── controllers/                   # HTTP Request Controllers
    │   ├── company.controller.ts
    │   ├── property.controller.ts
    │   ├── resident.controller.ts
    │   └── residentAuth.controller.ts
    └── routes/                        # Express Route Definitions
        ├── company.routes.ts
        ├── property.routes.ts
        ├── resident.routes.ts
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

#### Step 6: Create Controller (`src/web-app/controllers/<module>.controller.ts`)

Extract parameters, delegate execution to the service layer, and return standardized JSON responses.

#### Step 7: Define Routes & Register Router (`src/web-app/routes/<module>.routes.ts`)

Connect validation middleware, authentication guards, and controller handler methods. Then register the module router in `src/web-app/routes/index.ts`.

---

## Database Connections & Server Startup Logs

When starting the server with `pnpm dev` / `npm run dev`, the server logs explicit status notifications:

- `✅ Database connected successfully!` when MySQL connection is authenticated.
- `✅ Database models synchronized successfully!` when Sequelize models sync.
- `🚀 Server started running on port http://localhost:3002` when Express & Socket.io server starts listening.

---

## Database Migrations & Executed Scripts

> **Mandatory Rule**: Every time a new domain model is created in `src/models`, a corresponding migration file **MUST** be created under `src/migrations/`.

### Migration Commands

```bash
# Check migration status
pnpm migrate:status

# Run all pending migrations
pnpm migrate:up

# Rollback last executed migration
pnpm migrate:down
```

### Key Master Migrations

- `src/migrations/20260826120000-create-initial-schema.ts`: Master initial schema migration file creating all module tables with section comments (`company`, `company_custom_fields`, `properties`, `property_blocks`, `property_floors`, `property_units`, `users`, `user_details`, `departments`, `job_categories`, `roles`, `resources`, `user_locations`, `employee_managers`, `residents`, `resident_family_members`).
- `src/migrations/20260827160000-seed-initial-data.ts`: Master seed migration file populating system roles, resources, departments, job categories, and initial superadmin account.

---

## Resident & Mobile Auth Domain API

The Resident module manages property occupants (Owners, Tenants, and Family Members) and provides dedicated mobile app authentication.

### Database Architecture & Domain Rules

```text
property_units
   └── residents (Primary Owner or Tenant)
         └── resident_family_members (Family members living in flat)
```

1. **Owner (`OWNER`)**: Can be marked as `Physically Residing` (`isResiding = true`) or `Off-site Landlord` (`isResiding = false`).
2. **Tenant (`TENANT`)**: Must be `Physically Residing` (`isResiding = true`). Tenants can ONLY be onboarded to flats that have a registered **Off-site Owner**.
3. **Family Members (`resident_family_members`)**: Stored with relation, gender, age, contact info, and optional **individual mobile app login credentials** (`username`, `passwordHash`, `email`).

### Mobile App Authentication Endpoint

```bash
POST /api/v1/residents/auth/login
```

- **Dual-Table Authentication**: Checks `residents` first; if not found, checks `resident_family_members`.
- **Response**: Returns JWT token + flat/unit context (`unit_number`, `occupancyStatus`, `role`).

### Resident Management Endpoints

- `POST /api/v1/residents`: Onboard new resident (Owner or Tenant) with optional nested `familyMembers` array.
- `GET /api/v1/residents`: Fetch all residents for a property location (supports `?locId=`, `?unitId=`, `?residentType=`, `?isResiding=`).
- `GET /api/v1/residents/unit/:unitId`: Fetch unit occupants, residing occupant, and landlord.
- `PUT /api/v1/residents/:id`: Update resident profile and sync family members.
- `DELETE /api/v1/residents/:id`: Soft-delete resident and associated family members.

---

## Company Domain API

Company management is aligned with Rely-Assist fields and Sequelize TypeScript models (`Company` & `CompanyCustomField`).

### Endpoints

- `POST /api/v1/company`: Create company record with file uploads.
- `GET /api/v1/company`: Fetch all active companies.
- `GET /api/v1/company/:id`: Fetch company by ID.
- `PUT /api/v1/company/:id`: Update company details.
- `DELETE /api/v1/company/:id`: Soft-delete company.
- `GET /api/v1/company/company-setup/status`: Check company setup status.

---

## Property Creation & Structure Domain API

The Property module provides full CRUD and structural hierarchy management for residential real estate projects.

### Domain Hierarchy

```text
Company (companyId)
  └── Property (Project level)
        └── PropertyBlock (Block / Tower)
              └── PropertyFloor (Floor)
                    └── PropertyUnit (Individual unit)
```

### Endpoints

- `POST /api/v1/property`: Create property with optional full nested hierarchy (`blocks` → `floors` → `units`).
- `GET /api/v1/property`: Fetch all active properties with hierarchy.
- `GET /api/v1/property/:id`: Fetch single property by ID.
- `PUT /api/v1/property/:id`: Update property details.
- `DELETE /api/v1/property/:id`: Soft-delete property.

---

## Static Media Uploads

Uploaded files (documents, logos, signatures) are stored in `uploads/` directory and served statically under `/uploads/filename`.

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before pushing.
