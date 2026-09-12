# Inventory global settings — part 1

The web entry point is `/global-settings/inventory`. Both the web routes and all `/api/v1/inventory` endpoints require super-admin access. Global inventory requests do not use the selected-property headers as implicit filters.

## Deployment

Apply `20260911120000-create-inventory-master-tables` through the existing Sequelize/Umzug migration workflow before exposing the new UI. Review pending migrations with `pnpm migrate:pending`; `pnpm migrate:up` applies pending migrations to the configured database. This feature's migration has only been executed against disposable test databases during implementation.

The migration creates nine `inventory_*` tables. `locationId` references `properties.id`. Models use UUIDs, Active's audit columns, and timestamps. No existing data is imported or rewritten. Rollback drops the new inventory tables and their data; do not roll it back after entering real inventory without preserving that data first.

## Contracts

- Categories and vendors: `GET/POST /inventory/{categories|vendors}` and `GET/PUT /inventory/{categories|vendors}/:id`.
- Items: `GET/POST /inventory/items` and `GET/PUT /inventory/items/:id`.
- Location assignment replacement: `PUT /inventory/{categories|vendors|items}/:id/locations` with `{ locationIds: string[] }`.
- Item/vendor assignment replacement: `PUT /inventory/items/:id/vendors` with `{ assignments: [{ vendorId, locationId }] }`.
- Custom-field definitions: `POST /inventory/categories/:id/fields`, `PUT/DELETE /inventory/categories/:id/fields/:fieldId`. Definitions are returned in category details.
- Package options: `GET /inventory/package-options`. This is the frontend's source of package types and valid stock-unit combinations.
- Lists accept `page`, `limit` (1–100), `search`, `isActive`, `locationId`, `sortBy` (`name`, `createdAt`, `updatedAt`), and `sortOrder` (`ASC`, `DESC`). Item lists also accept `categoryId`. They return `{ records, pagination: { page, limit, totalItems, totalPages } }` inside Active's response envelope.

Master updates are full form submissions through PUT; deactivation uses `isActive: false`. Item category is immutable after creation. Items contain `packType`, positive integral `packQuantity`, and `packUnit`, plus location IDs and custom-field values. Packaging is never stored in custom fields. This phase has no stock quantities, thresholds, purchase orders, or resident inventory.

Custom fields support text, number, select, date, and boolean values. There is a maximum of 100 definitions per category. Defaults initialize new item values; explicit null values remain cleared. Required fields added to populated categories need a valid default. Definition changes cannot invalidate existing values, and populated fields cannot be renamed, retyped, or deleted.

Writes are transactional. Dependent item locations and vendor assignments must be removed before removing their parent assignments. Vendor and item locations must overlap for an item/vendor assignment. Audit identities are taken from authentication.

## Verification

Use Node 24.19.x and the repository's pnpm version.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
INVENTORY_TEST_DATABASE=rely_inventory_test_local pnpm exec vitest run src/services/inventory.integration.test.ts
```

The integration suite is opt-in. It accepts only a new `rely_inventory_test_*` database name, refuses an existing database, creates the isolated schema using the actual migration, and removes it afterward. The configured MySQL user must be able to create/drop that test database. Ordinary `pnpm test` skips the database suite unless the opt-in variable is set.

Frontend tests exercise RHF/Zod validation, query invalidation after saving, dynamic required fields, and preservation of cleared values. Browser smoke checks use API fixtures; the separate MySQL/Supertest suite validates the actual backend routes, migrations, relational constraints, rollback, and access control.

## Assist-style web flow

Add/Edit forms are dedicated routes under `/global-settings/inventory`, with category details containing the item DataTable. Categories, vendors, item edits, location assignments, and item/vendor assignments preserve the originating list query on Save/Cancel. Category custom definitions are edited in the category form alongside its basic information and read-only standard fields.

Category POST/PUT accepts optional `fieldDefinitions`. For edits, entries with `id` update existing definitions; entries without `id` create definitions. A supplied list replaces the definition set, while omitting the property preserves it. The operation preserves item values and rolls back the whole category save on ownership, validation, or protected-deletion errors. Vendor POST/PUT accepts optional `locationIds`, saved atomically with contact details.

`POST /inventory/category-image` accepts one multipart `image` file (JPG, PNG, GIF; at most 10 MB). It uses Active's S3 upload infrastructure and returns `{ image: string }` inside the response envelope. File size, MIME type, signature, and super-admin access are validated. Upload tests mock S3; no live cloud upload is performed during verification.

The shared DataTable's optional controlled pagination and sorting support server inventory lists. Existing callers retain client pagination/sorting. Its toolbar remains mounted during loading and errors, preserving search focus.
