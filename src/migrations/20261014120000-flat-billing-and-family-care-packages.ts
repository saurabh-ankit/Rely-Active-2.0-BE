import { DataTypes, QueryTypes, type ModelAttributeColumnOptions, type QueryInterface } from 'sequelize'

/**
 * Flat billing (the Rely Assist model) and family-member care packages.
 *
 * Billing: an invoice is computed live from the source modules and saved as service-line
 * snapshots, with receipts for payments.
 * - Drops the old folio / subscription / event / ledger billing tables (their data is not kept).
 * - Creates invoices, services_invoice, miscellaneous_billing, unit_miscellaneous_items, receipts,
 *   receipt_allocations, invoice_documents and carried_forward_invoices.
 *   - invoices store bill-to, discount reason and GST as plain columns, plus the carried-forward
 *     amount, the remaining balance and whether the invoice was carried into a newer one.
 *   - services_invoice lines record who used the service (resident or family member).
 *   - receipts record the invoice total, the amount paid before, and the balance after.
 *   - receipt_allocations record where each payment went (older carried balances are paid first).
 * - Adds doctor_appointments.fee (consultation fee captured at booking), backfilled from each
 *   doctor's current consultantFee.
 *
 * Care packages: package subscriptions, care task assignments, completions and care task
 * charges get an optional familyMemberId, so a family member can have their own package.
 *
 * Every step checks what already exists and only adds what is missing, so it is safe to run on a
 * fresh database or on one that already has some of these tables.
 */

const OLD_TABLES = [
  'billing_payment_allocations',
  'billing_ledger_entries',
  'billing_invoice_lines',
  'billing_payments',
  'billing_invoices',
  'billing_events',
  'billing_subscriptions',
  'billing_price_plans',
  'billing_contracts',
  'billing_products',
  'billing_parties',
  'billing_runs',
  'billing_unit_residents',
  'billing_accounts',
  'invoice_lines',
]

const INVOICE_STATUSES = [
  'DRAFT',
  'PENDING',
  'PAID',
  'PARTIALLY_PAID',
  'CANCELLED',
  'OVERDUE',
  'OBSOLETE',
  'CARRY_FORWARDED',
]
const PAYMENT_METHODS = ['CASH', 'UPI', 'CHEQUE', 'CARD', 'NET_BANKING', 'OTHER']
const SERVICE_TYPES = [
  'RENT',
  'CARE_PACKAGE',
  'FOOD_PACKAGE',
  'FOOD_ORDER',
  'ADDITIONAL_TASK',
  'DOCTOR_CONSULTATION',
  'LAB_TEST',
  'INVENTORY_ITEM',
  'EVENT_FEE',
  'VENUE_BOOKING',
  'MAINTENANCE',
  'MISCELLANEOUS_AS_SERVICE',
  'MISCELLANEOUS_AT_BILLING',
  'CARRY_FORWARD',
]

/** Care tables that can belong to a family member. */
const FAMILY_CARE_TABLES = [
  'package_subscriptions',
  'care_task_assignments',
  'resident_care_task_completions',
  'additional_task_charges',
]

const base = {
  id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false },
}
const isDeleted = { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
const money = (allowNull = false) => ({
  type: DataTypes.DECIMAL(12, 2),
  allowNull,
  ...(allowNull ? {} : { defaultValue: 0 }),
})
const rate = { type: DataTypes.DECIMAL(5, 2), allowNull: true }
const fk = (model: string, allowNull = false, onDelete = 'RESTRICT') => ({
  type: DataTypes.UUID,
  allowNull,
  references: { model, key: 'id' },
  onDelete: allowNull ? 'SET NULL' : onDelete,
})

type ColumnSpec = Record<string, ModelAttributeColumnOptions>

const INVOICE_COLUMNS: ColumnSpec = {
  ...base,
  invoiceNumber: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  unitId: fk('property_units'),
  propertyId: fk('properties'),
  billToResidentId: fk('residents', true),
  billToName: { type: DataTypes.STRING(255), allowNull: true },
  billToPhone: { type: DataTypes.STRING(30), allowNull: true },
  billToEmail: { type: DataTypes.STRING(255), allowNull: true },
  billToUnitNumber: { type: DataTypes.STRING(50), allowNull: true },
  startDate: { type: DataTypes.DATEONLY, allowNull: false },
  endDate: { type: DataTypes.DATEONLY, allowNull: false },
  subtotal: money(),
  tax: money(),
  discount: money(),
  discountPercentage: rate,
  discountAmount: money(true),
  discountReason: { type: DataTypes.STRING(500), allowNull: true },
  gstNumber: { type: DataTypes.STRING(30), allowNull: true },
  gstRate: rate,
  cgstRate: rate,
  sgstRate: rate,
  taxableAmount: money(true),
  cgstAmount: money(true),
  sgstAmount: money(true),
  carriedForwardAmount: money(),
  total: money(),
  discountedAmount: money(),
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
  status: { type: DataTypes.ENUM(...INVOICE_STATUSES), allowNull: false, defaultValue: 'PENDING' },
  billingMode: { type: DataTypes.ENUM('MONTHLY', 'CUSTOM'), allowNull: false },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true },
  paidAmount: money(),
  remainingBalance: money(),
  isCarriedForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  paymentMethod: { type: DataTypes.ENUM(...PAYMENT_METHODS), allowNull: true },
  paymentReference: { type: DataTypes.STRING(255), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  isDeleted,
}

const SERVICES_INVOICE_COLUMNS: ColumnSpec = {
  ...base,
  invoiceId: fk('invoices', false, 'CASCADE'),
  serviceType: { type: DataTypes.ENUM(...SERVICE_TYPES), allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  price: money(),
  total: money(),
  residentId: fk('residents', true),
  familyMemberId: { type: DataTypes.UUID, allowNull: true },
  consumerType: { type: DataTypes.ENUM('RESIDENT', 'FAMILY_MEMBER'), allowNull: true },
  consumerName: { type: DataTypes.STRING(255), allowNull: true },
  sourceId: { type: DataTypes.STRING(64), allowNull: true },
  serviceStartDate: { type: DataTypes.DATEONLY, allowNull: true },
  serviceEndDate: { type: DataTypes.DATEONLY, allowNull: true },
  isAdjustment: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  isDeleted,
}

const RECEIPT_COLUMNS: ColumnSpec = {
  ...base,
  receiptNumber: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  invoiceId: fk('invoices'),
  unitId: fk('property_units'),
  paidAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  paymentMethod: { type: DataTypes.ENUM(...PAYMENT_METHODS), allowNull: false },
  paymentReference: { type: DataTypes.STRING(255), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  handedOverTo: fk('users', true),
  invoiceTotal: money(true),
  paidBefore: money(true),
  invoiceRemainingBalance: money(true),
  invoiceStatus: { type: DataTypes.ENUM(...INVOICE_STATUSES), allowNull: true },
  imageUrl: { type: DataTypes.STRING(1024), allowNull: true },
  isDeleted,
}

const OTHER_TABLES: { name: string; columns: ColumnSpec; indexes: string[][] }[] = [
  {
    name: 'miscellaneous_billing',
    columns: {
      ...base,
      invoiceId: fk('invoices', false, 'CASCADE'),
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
      price: money(),
      total: money(),
      isDeleted,
    },
    indexes: [['invoiceId']],
  },
  {
    name: 'unit_miscellaneous_items',
    columns: {
      ...base,
      unitId: fk('property_units'),
      residentId: fk('residents', true),
      propertyId: fk('properties'),
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
      price: money(),
      total: money(),
      serviceDate: { type: DataTypes.DATEONLY, allowNull: false },
      attachmentUrl: { type: DataTypes.STRING(1024), allowNull: true },
      isDeleted,
    },
    indexes: [['unitId', 'serviceDate']],
  },
]

/** Creates the table, or adds any of its columns that are missing. Returns the added column names. */
async function ensureTable(
  queryInterface: QueryInterface,
  tables: string[],
  name: string,
  columns: ColumnSpec,
  indexes: string[][],
): Promise<string[]> {
  if (!tables.includes(name)) {
    await queryInterface.createTable(name, columns)
    for (const fields of indexes) await queryInterface.addIndex(name, fields)
    console.log(`✅ Created ${name}`)
    return Object.keys(columns)
  }
  const existing = await queryInterface.describeTable(name)
  const added: string[] = []
  for (const [column, spec] of Object.entries(columns)) {
    if (existing[column]) continue
    await queryInterface.addColumn(name, column, spec)
    added.push(column)
  }
  if (added.length) console.log(`✅ Added to ${name}: ${added.join(', ')}`)
  return added
}

interface InvoiceDataRow {
  id: string
  invoiceData: string | Record<string, unknown> | null
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const sequelize = queryInterface.sequelize
  let tables = (await queryInterface.showAllTables()).map((t) => String(t))

  // ── 1. Drop the old billing module ─────────────────────────────────────────
  const toDrop = OLD_TABLES.filter((t) => tables.includes(t))
  if (toDrop.length) {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')
    try {
      for (const table of toDrop) await queryInterface.dropTable(table)
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
    }
    console.log(`✅ Dropped old billing tables: ${toDrop.join(', ')}`)
    tables = (await queryInterface.showAllTables()).map((t) => String(t))
  }

  // ── 2. invoices ────────────────────────────────────────────────────────────
  const addedInvoiceColumns = await ensureTable(queryInterface, tables, 'invoices', INVOICE_COLUMNS, [
    ['unitId', 'isDeleted', 'status'],
    ['unitId', 'startDate', 'endDate'],
    ['propertyId', 'status'],
  ])

  // An older invoices table kept bill-to / discount reason / GST in a JSON column: move them out.
  const invoiceCols = await queryInterface.describeTable('invoices')
  if (invoiceCols.invoiceData) {
    const rows = await sequelize.query<InvoiceDataRow>('SELECT id, invoiceData FROM invoices', {
      type: QueryTypes.SELECT,
    })
    for (const row of rows) {
      const data = (typeof row.invoiceData === 'string' ? JSON.parse(row.invoiceData) : row.invoiceData) ?? {}
      const billTo = data.billTo ?? {}
      const gst = data.gst ?? null
      await sequelize.query(
        `UPDATE invoices SET billToName = ?, billToPhone = ?, billToEmail = ?, billToUnitNumber = ?, discountReason = ?,
           gstNumber = ?, gstRate = ?, cgstRate = ?, sgstRate = ?, taxableAmount = ?, cgstAmount = ?, sgstAmount = ?
         WHERE id = ?`,
        {
          replacements: [
            billTo.name ?? null,
            billTo.phone ?? null,
            billTo.email ?? null,
            billTo.unitNumber ?? null,
            data.discountReason ?? null,
            gst?.gstNumber ?? null,
            gst?.rate ?? null,
            gst?.cgstRate ?? null,
            gst?.sgstRate ?? null,
            gst?.taxable ?? null,
            gst?.cgst ?? null,
            gst?.sgst ?? null,
            row.id,
          ],
        },
      )
    }
    await queryInterface.removeColumn('invoices', 'invoiceData')
  }

  // ── 3. Invoice lines, misc items, receipts ─────────────────────────────────
  await ensureTable(queryInterface, tables, 'services_invoice', SERVICES_INVOICE_COLUMNS, [
    ['invoiceId'],
    ['serviceType', 'sourceId'],
  ])
  for (const t of OTHER_TABLES) await ensureTable(queryInterface, tables, t.name, t.columns, t.indexes)
  const addedReceiptColumns = await ensureTable(queryInterface, tables, 'receipts', RECEIPT_COLUMNS, [
    ['invoiceId'],
    ['unitId', 'createdAt'],
  ])

  // ── 4. receipt_allocations ─────────────────────────────────────────────────
  if (!tables.includes('receipt_allocations')) {
    await queryInterface.createTable('receipt_allocations', {
      ...base,
      receiptId: fk('receipts', false, 'CASCADE'),
      invoiceId: fk('invoices', false, 'CASCADE'),
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    })
    await queryInterface.addIndex('receipt_allocations', ['receiptId'], { name: 'idx_receipt_allocations_receipt' })
    await queryInterface.addIndex('receipt_allocations', ['invoiceId'], { name: 'idx_receipt_allocations_invoice' })
    console.log('✅ Created receipt_allocations')
  }

  // ── 5. invoice_documents, carried_forward_invoices ─────────────────────────
  await ensureTable(
    queryInterface,
    tables,
    'invoice_documents',
    {
      ...base,
      invoiceId: fk('invoices', false, 'CASCADE'),
      receiptId: fk('receipts', true),
      documentType: { type: DataTypes.ENUM('INVOICE', 'RECEIPT'), allowNull: false },
      s3Url: { type: DataTypes.STRING(1024), allowNull: false },
      s3Key: { type: DataTypes.STRING(512), allowNull: false },
      isDeleted,
    },
    [['invoiceId', 'documentType'], ['receiptId']],
  )
  await ensureTable(
    queryInterface,
    tables,
    'carried_forward_invoices',
    {
      ...base,
      targetInvoiceId: fk('invoices', false, 'CASCADE'),
      sourceInvoiceId: fk('invoices'),
      unitId: fk('property_units'),
      propertyId: fk('properties'),
      carriedAmount: money(),
      originalTotal: money(true),
      originalPaid: money(true),
      sourceStatus: { type: DataTypes.STRING(30), allowNull: true },
    },
    [['targetInvoiceId'], ['sourceInvoiceId']],
  )

  // ── 6. Backfill balances on invoices / receipts that existed before ────────
  if (addedInvoiceColumns.includes('carriedForwardAmount')) {
    await sequelize.query(`
      UPDATE invoices i SET carriedForwardAmount = COALESCE((
        SELECT SUM(s.total) FROM services_invoice s
        WHERE s.invoiceId = i.id AND s.serviceType = 'CARRY_FORWARD' AND s.isDeleted = 0), 0)`)
  }
  if (addedInvoiceColumns.includes('remainingBalance')) {
    await sequelize.query(`
      UPDATE invoices SET remainingBalance =
        CASE WHEN status IN ('OBSOLETE', 'CARRY_FORWARDED', 'CANCELLED') THEN 0
             ELSE GREATEST(0, discountedAmount - paidAmount) END`)
  }
  if (addedInvoiceColumns.includes('isCarriedForward')) {
    await sequelize.query(`
      UPDATE invoices i SET isCarriedForward = 1
      WHERE EXISTS (SELECT 1 FROM carried_forward_invoices c WHERE c.sourceInvoiceId = i.id)`)
  }
  if (addedReceiptColumns.includes('paidBefore')) {
    await sequelize.query(`
      UPDATE receipts r JOIN invoices i ON i.id = r.invoiceId
      SET r.invoiceTotal = i.discountedAmount,
          r.paidBefore = COALESCE((
            SELECT SUM(p.paidAmount) FROM (SELECT * FROM receipts) p
            WHERE p.invoiceId = r.invoiceId AND p.isDeleted = 0 AND p.createdAt < r.createdAt), 0)`)
  }
  // Receipts without allocations went entirely to their own invoice.
  await sequelize.query(`
    INSERT INTO receipt_allocations (id, receiptId, invoiceId, amount, createdBy, createdAt, updatedAt)
    SELECT UUID(), r.id, r.invoiceId, r.paidAmount, r.createdBy, r.createdAt, r.createdAt
    FROM receipts r
    WHERE r.isDeleted = 0 AND NOT EXISTS (SELECT 1 FROM receipt_allocations a WHERE a.receiptId = r.id)`)

  // ── 7. doctor_appointments.fee ─────────────────────────────────────────────
  const apptCols = await queryInterface.describeTable('doctor_appointments')
  if (!apptCols.fee) {
    await queryInterface.addColumn('doctor_appointments', 'fee', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Doctor's consultation fee captured at booking",
    })
    await sequelize.query(`
      UPDATE doctor_appointments da
      JOIN user_details ud ON ud.userId = da.doctorId
      SET da.fee = ud.consultantFee
      WHERE da.fee IS NULL AND ud.consultantFee IS NOT NULL
    `)
    console.log('✅ Added doctor_appointments.fee (backfilled from consultantFee)')
  }

  // ── 8. Care packages for family members ────────────────────────────────────
  for (const table of FAMILY_CARE_TABLES) {
    if (!tables.includes(table)) continue
    const cols = await queryInterface.describeTable(table)
    if (cols.familyMemberId) continue
    await queryInterface.addColumn(table, 'familyMemberId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'resident_family_members', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
    await queryInterface.addIndex(table, ['familyMemberId'], { name: `idx_${table}_family_member` })
    console.log(`✅ Added ${table}.familyMemberId`)
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  for (const table of FAMILY_CARE_TABLES) {
    const cols = await queryInterface.describeTable(table).catch(() => null)
    if (!cols?.familyMemberId) continue
    const fks = (await queryInterface.getForeignKeyReferencesForTable(table)) as {
      columnName: string
      constraintName: string
    }[]
    for (const fkRef of fks.filter((f) => f.columnName === 'familyMemberId')) {
      await queryInterface.removeConstraint(table, fkRef.constraintName)
    }
    await queryInterface.removeIndex(table, `idx_${table}_family_member`).catch(() => {})
    await queryInterface.removeColumn(table, 'familyMemberId')
  }

  const tables = (await queryInterface.showAllTables()).map((t) => String(t))
  for (const table of [
    'receipt_allocations',
    'carried_forward_invoices',
    'invoice_documents',
    'receipts',
    'unit_miscellaneous_items',
    'miscellaneous_billing',
    'services_invoice',
    'invoices',
  ]) {
    if (tables.includes(table)) await queryInterface.dropTable(table)
  }
  const apptCols = await queryInterface.describeTable('doctor_appointments')
  if (apptCols.fee) await queryInterface.removeColumn('doctor_appointments', 'fee')
}
