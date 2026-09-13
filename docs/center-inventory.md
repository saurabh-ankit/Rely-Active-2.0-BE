# Property inventory

The sidebar entry is `/admin/inventory/home`. Select a category to open Items,
Suppliers, Purchase Orders, and Transactions, matching the property inventory
structure in Rely Assist. Items retains the Inventory Items sub-tab; Transactions
retains Inventory Item Transactions. Resident inventory, resident transactions,
assignment, and stock-out mutations are not included.

## Deployment

Run `pnpm migrate:up` before starting the API. The 19:00 migration creates or
upgrades the stock tables; the 20:00 reconciliation migration handles databases
that had already recorded the earlier simplified inventory schema. Both paths
preserve existing stock and transaction history. Legacy line tables remain in
place. Rollback intentionally refuses to drop inventory history.

The schema includes property balances, purchase orders and lines, receipt headers
and batch lines, request IDs, and package snapshots. Supplier deletion is soft;
historical order and receipt supplier references remain readable.

## API and quantity contract

All endpoints are under `/api/v1/center-inventory/:locationId`:

- `GET access`, `package-options`, `categories`, `categories/:id`, `items`,
  `items/:id`, `items/:id/editor`, `suppliers`, and `stats`.
- `PUT items/:id`, `items/:id/thresholds`, `items/:id/suppliers`, `suppliers/:id`;
  `DELETE suppliers/:id`.
- `GET/POST purchase-orders`; `GET/PUT/DELETE purchase-orders/:id`;
  `POST purchase-orders/:id/decision` with `approve` or `reject`;
  `POST purchase-orders/:id/receive`.
- `POST stock-in`; `GET transactions` and `transactions/:id`.

Quantities in mutation payloads and storage are integer base units. PO forms
collect whole package counts and convert once before submission. Prices are per
package, including agreed PO prices, receipt purchase prices, and MRP. The
package snapshot on each line fixes the meaning of quantities and prices in
history. Packaging changes are refused after an item has stock or order history.
Package policies come from the backend; genuine container movements must be
whole containers, following Assist's `assertWholePackageMovement` semantics.

A PO created by ADMIN/SUPER_ADMIN starts approved. Other authorized creators
produce approval_pending orders. Only super-admins approve/reject; rejection
sets cancelled, as in Assist. Unreceived draft, pending-approval, and approved
orders can be edited. Only draft/pending-approval orders can be deleted. Receipts
accept approved/partially_received orders and compute partial/received status.
As in Assist, editing an approved order preserves its approval status.

Create and receipt payloads carry a UUID requestId. Exact receipt retries return
the original transaction; reuse with different data returns 409. A property row
lock serializes stock changes, including first balance creation and concurrent
receipts against different POs. Receipt validation, balance changes, batch
history, and PO progress commit in one transaction.

## Authorization

The API checks active user scope and the selected property's `INVENTORY`
view/create/update/delete grants directly. Super-admins retain their existing
bypass. Resident/family accounts are excluded. The access endpoint drives UI
actions. Shared item/supplier edits require authorization at every assigned
property. Property supplier/item assignment data is not exposed cross-property.
The generic permission-code helper is not used because it does not enforce
individual action grants in the current application.

## Verification

No test files were added. Verification used TypeScript checks, production builds,
targeted lint, browser inspection, and disposable database fixtures. Database
checks covered approval/rejection, partial/full receiving, package valuation,
direct multi-batch receipts, repeated request IDs, conflicting retries,
concurrent over-receipts, property isolation, missing permissions, and packaging
change protection. All disposable fixtures were removed afterward.
