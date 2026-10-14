/**
 * Every permission-controlled module and sub-module, in display order.
 *
 * This is the single source of truth: the catalogue sync (run at server start)
 * writes it to the `resources` table, the access matrix is built from that table,
 * and routes/screens check these keys.
 *
 * Adding a module or sub-module:
 *   1. Add the entry here (sub-module keys are `PARENT.CHILD`).
 *   2. Pick `grant`: 'inherit' copies what admins already have on the parent module
 *      (default for sub-modules, so splitting a module never takes access away);
 *      'none' starts with nobody (default for new modules; super admins always pass).
 *   3. Add the same key to the frontend `src/lib/permissions/resourceKeys.ts`.
 *   4. Protect routes with `authorizeResource` / `resourceGuard` and gate the screens.
 *   5. Restart the server — the row appears in the access matrix.
 * Removing an entry deactivates the resource (grants are kept in case it returns).
 */

export type ResourceGrant = 'inherit' | 'none'

export interface CatalogEntry {
  key: string
  name: string
  description?: string
  grant?: ResourceGrant
  children?: CatalogEntry[]
}

export const RESOURCE_CATALOG = [
  {
    key: 'RESIDENT',
    name: 'Resident',
    description: 'Resident management & directory',
    children: [
      { key: 'RESIDENT.DIRECTORY', name: 'Directory & profile', description: 'Resident list and the Profile tab' },
      { key: 'RESIDENT.MEDICAL', name: 'Medical', description: 'Medical tab: care tasks, care team, clinical care' },
    ],
  },
  {
    key: 'EMPLOYEE',
    name: 'Employee',
    description: 'Employee directory & staff profiles',
    children: [
      { key: 'EMPLOYEE.DIRECTORY', name: 'Directory & profiles', description: 'Employee list, profiles and details' },
      {
        key: 'EMPLOYEE.ACTIVITY',
        name: 'Activity & work log',
        description: 'Tickets, gate passes, deliveries, work log',
      },
    ],
  },
  {
    key: 'ROSTER',
    name: 'Shift & Roster',
    description: 'Shift & roster schedules',
    children: [
      { key: 'ROSTER.SHIFTS', name: 'Shifts', description: 'Shift definitions and timings' },
      { key: 'ROSTER.ROSTER', name: 'Roster', description: 'Roster calendar, swaps, covers and days off' },
      { key: 'ROSTER.EMPLOYEES', name: 'Employees', description: 'Per-employee rosters' },
      { key: 'ROSTER.AREAS', name: 'Areas', description: 'Roster areas' },
    ],
  },
  {
    key: 'TICKETS',
    name: 'Ticket Management',
    description: 'Repair & Maintenance and Concierge tickets',
    children: [
      { key: 'TICKETS.RNM', name: 'Repair & Maintenance', description: 'Repair & maintenance tickets' },
      { key: 'TICKETS.CONCIERGE', name: 'Concierge', description: 'Concierge tickets' },
    ],
  },
  {
    key: 'GNS',
    name: 'Gate & Security',
    description: 'Gate passes, visitor check-ins & security scans',
    children: [
      { key: 'GNS.ENTRY_LOGS', name: 'Entry logs', description: 'Visitor entries, walk-in approvals, check-outs' },
      { key: 'GNS.PREAPPROVED', name: 'Pre-approved passes', description: 'Passes pre-approved by residents' },
    ],
  },
  {
    key: 'INVENTORY',
    name: 'Inventory',
    description: 'Inventory & stock management',
    children: [
      { key: 'INVENTORY.ITEMS', name: 'Items', description: 'Items, stock levels and thresholds' },
      { key: 'INVENTORY.SUPPLIERS', name: 'Suppliers', description: 'Suppliers of this property' },
      { key: 'INVENTORY.PURCHASE_ORDERS', name: 'Purchase Orders', description: 'Purchase orders and receiving' },
      { key: 'INVENTORY.TRANSACTIONS', name: 'Transactions', description: 'Stock in/out and item issues' },
    ],
  },
  {
    key: 'ASSET',
    name: 'Asset Management',
    description: 'Asset tracking & maintenance',
    children: [
      { key: 'ASSET.ASSETS', name: 'Assets', description: 'Asset register, bulk upload' },
      { key: 'ASSET.CATEGORIES', name: 'Categories', description: 'Asset categories' },
      { key: 'ASSET.VENDORS', name: 'Vendors', description: 'Asset vendors' },
      { key: 'ASSET.ITEMS', name: 'Items', description: 'Asset items' },
      { key: 'ASSET.ASSIGNMENTS', name: 'Assignments', description: 'Assigning and returning assets' },
      { key: 'ASSET.MAINTENANCE', name: 'Maintenance', description: 'Service logs, warranties, calibrations' },
      { key: 'ASSET.COMPLIANCE', name: 'Compliance', description: 'Certifications, inspections, training' },
    ],
  },
  {
    key: 'MEDICAL',
    name: 'Medical',
    description: 'Medical dashboard, care tasks & records',
    children: [
      { key: 'MEDICAL.APPOINTMENTS', name: 'Appointments', description: 'Doctor appointments' },
      { key: 'MEDICAL.CARE_TASKS', name: 'Care tasks', description: 'Care tasks and assignments' },
      { key: 'MEDICAL.CARE_PACKAGES', name: 'Care packages', description: 'Care packages' },
      { key: 'MEDICAL.SUBSCRIPTIONS', name: 'Subscriptions', description: 'Package subscriptions' },
    ],
  },
  {
    key: 'FNB',
    name: 'Food',
    description: 'Food & Beverage dining and orders',
    children: [
      { key: 'FNB.MENU_PLANNER', name: 'Menu Planner & Slots', description: 'Weekly menu, date menus, publishing' },
      { key: 'FNB.ATTENDANCE', name: 'Food Attendance', description: 'Dine-in attendance' },
      { key: 'FNB.PACKAGES', name: 'Property Packages & Pricing', description: 'Food packages and pricing' },
      { key: 'FNB.DISHES', name: 'Dish Catalogue', description: 'Dishes' },
      { key: 'FNB.MEAL_SLOTS', name: 'Meal Slots & Timings', description: 'Meal slots and timings' },
      { key: 'FNB.ORDERS', name: 'Resident Orders', description: 'Resident orders, deliveries and history' },
    ],
  },
  {
    key: 'BILLING',
    name: 'Billing',
    description: 'Invoices, payments & ledgers',
    children: [
      { key: 'BILLING.INVOICES', name: 'Invoices & bills', description: 'Invoices and bills' },
      { key: 'BILLING.LEDGER', name: 'Ledger', description: 'Ledger entries' },
      { key: 'BILLING.PARTIES', name: 'Folio & payers', description: 'Billing accounts and payers' },
      { key: 'BILLING.SUBSCRIPTIONS', name: 'Recurring services', description: 'Recurring services' },
      { key: 'BILLING.USAGE', name: 'Pending usage', description: 'Usage awaiting billing' },
    ],
  },
  {
    key: 'EVENTS',
    name: 'Events',
    description: 'Community events & activities',
    children: [
      { key: 'EVENTS.EVENTS', name: 'Events', description: 'Events and registrations' },
      { key: 'EVENTS.VENUES', name: 'Venues', description: 'Event venues' },
      { key: 'EVENTS.REQUESTS', name: 'Event requests', description: 'Event requests from residents' },
    ],
  },
  {
    key: 'SETTINGS',
    name: 'Settings',
    description: 'Property settings, feedback forms & advertisements',
    children: [
      { key: 'SETTINGS.FEEDBACK', name: 'Feedback forms', description: 'Feedback forms and responses' },
      { key: 'SETTINGS.ADVERTISEMENTS', name: 'Advertisements', description: 'Advertisements' },
    ],
  },
] as const satisfies readonly CatalogEntry[]

type KeysOf<T> = T extends { key: infer K; children: readonly (infer C)[] }
  ? K | KeysOf<C>
  : T extends { key: infer K }
    ? K
    : never

/** Every module and sub-module key, e.g. 'FNB' | 'FNB.ORDERS'. A misspelt key fails to compile. */
export type ResourceKey = KeysOf<(typeof RESOURCE_CATALOG)[number]>

export interface FlatCatalogEntry {
  key: ResourceKey
  name: string
  description: string | null
  parentKey: ResourceKey | null
  sortOrder: number
  grant: ResourceGrant
}

/** The catalogue as rows: modules first, each followed by its sub-modules, with defaults applied. */
export const flattenCatalog = (): FlatCatalogEntry[] => {
  const rows: FlatCatalogEntry[] = []
  const walk = (entries: readonly CatalogEntry[], parentKey: string | null) => {
    entries.forEach((entry, index) => {
      rows.push({
        key: entry.key as ResourceKey,
        name: entry.name,
        description: entry.description ?? null,
        parentKey: parentKey as ResourceKey | null,
        sortOrder: index + 1,
        grant: entry.grant ?? (parentKey ? 'inherit' : 'none'),
      })
      if (entry.children) walk(entry.children, entry.key)
    })
  }
  walk(RESOURCE_CATALOG, null)
  return rows
}

/** `FNB.ORDERS` → `FNB`; a module key → null. */
export const parentKeyOf = (key: string): string | null => {
  const at = key.lastIndexOf('.')
  return at === -1 ? null : key.slice(0, at)
}
