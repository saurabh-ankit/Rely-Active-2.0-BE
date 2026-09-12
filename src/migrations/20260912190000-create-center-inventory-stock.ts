import { DataTypes, type QueryInterface, type ModelAttributeColumnOptions } from 'sequelize'
const fk = (model: string) => ({
  type: DataTypes.UUID,
  allowNull: false,
  references: { model, key: 'id' },
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
})
const text = (length: number) => ({ type: DataTypes.STRING(length), allowNull: false })
const quantity = { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
const money = { type: DataTypes.DECIMAL(12, 2), allowNull: false }
const date = { type: DataTypes.DATEONLY, allowNull: false }
const common = {
  id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false },
}
// Upgrade both fresh installs and the earlier simplified-stock schema. DDL is
// restartable: MySQL commits DDL independently, so check columns and indexes first.
async function ensureTable(qi: QueryInterface, table: string, columns: Record<string, ModelAttributeColumnOptions>) {
  const tables = await qi.showAllTables()
  if (!tables.includes(table)) {
    await qi.createTable(table, columns)
    return
  }
  const existing = await qi.describeTable(table)
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing[name]) await qi.addColumn(table, name, { ...definition, allowNull: true })
  }
}
async function ensureIndex(
  qi: QueryInterface,
  table: string,
  fields: string[],
  options: { unique?: boolean; name?: string } = {},
) {
  const indexes = (await qi.showIndex(table)) as { fields: { attribute: string }[]; unique: boolean }[]
  if (
    !indexes.some(
      (index) =>
        index.fields.map((f) => f.attribute).join(',') === fields.join(',') && (!options.unique || index.unique),
    )
  )
    await qi.addIndex(table, fields, options)
}
export async function up({ context: qi }: { context: QueryInterface }) {
  if (!(await qi.describeTable('inventory_vendors')).isDeleted) {
    await qi.addColumn('inventory_vendors', 'isDeleted', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }
  await ensureTable(qi, 'inventory_stock', {
    ...common,
    locationId: fk('properties'),
    itemId: fk('inventory_items'),
    quantity: quantity,
  })
  await ensureTable(qi, 'inventory_purchase_orders', {
    ...common,
    locationId: fk('properties'),
    supplierId: fk('inventory_vendors'),
    poNumber: text(60),
    status: text(30),
    requestId: text(36),
    requestHash: text(64),
    notes: { type: DataTypes.TEXT, allowNull: true },
  })
  await ensureTable(qi, 'inventory_purchase_order_lines', {
    ...common,
    purchaseOrderId: fk('inventory_purchase_orders'),
    itemId: fk('inventory_items'),
    itemName: text(255),
    packType: text(30),
    packUnit: text(30),
    packQuantity: quantity,
    orderedQuantity: quantity,
    receivedQuantity: quantity,
    agreedPrice: money,
  })
  await ensureTable(qi, 'inventory_stock_transactions', {
    ...common,
    locationId: fk('properties'),
    supplierId: fk('inventory_vendors'),
    purchaseOrderId: { ...fk('inventory_purchase_orders'), allowNull: true },
    transactionNumber: text(60),
    transactionType: text(30),
    date: date,
    notes: { type: DataTypes.TEXT, allowNull: true },
    requestId: text(36),
    requestHash: text(64),
  })
  await ensureTable(qi, 'inventory_stock_transaction_lines', {
    ...common,
    transactionId: fk('inventory_stock_transactions'),
    itemId: fk('inventory_items'),
    itemName: text(255),
    packType: text(30),
    packUnit: text(30),
    packQuantity: quantity,
    quantity: quantity,
    unitCost: money,
    mrpPrice: money,
    batchNumber: { ...text(100), allowNull: true },
    transitId: { ...text(100), allowNull: true },
    receivedDate: date,
    manufacturedDate: { ...date, allowNull: true },
    expiryDate: { ...date, allowNull: true },
  })
  await qi.changeColumn('inventory_purchase_orders', 'status', text(30))
  await qi.sequelize.query(
    'UPDATE inventory_purchase_orders SET requestId = COALESCE(requestId, id), requestHash = COALESCE(requestHash, SHA2(id, 256))',
  )
  await qi.sequelize.query(
    "UPDATE inventory_stock_transactions t LEFT JOIN inventory_purchase_orders p ON p.id = t.purchaseOrderId SET t.requestId = COALESCE(t.requestId, t.id), t.requestHash = COALESCE(t.requestHash, SHA2(t.id, 256)), t.transactionNumber = COALESCE(t.transactionNumber, CONCAT('ST-', t.id)), t.date = COALESCE(t.date, DATE(t.createdAt)), t.supplierId = COALESCE(t.supplierId, p.supplierId)",
  )
  // Earlier disbursement records have no supplier. Retain them; new receipts
  // require a supplier in validation and service code.
  await qi.changeColumn('inventory_stock_transactions', 'supplierId', { ...fk('inventory_vendors'), allowNull: true })
  for (const table of ['inventory_purchase_orders', 'inventory_stock_transactions']) {
    await qi.changeColumn(table, 'requestId', text(36))
    await qi.changeColumn(table, 'requestHash', text(64))
  }
  await qi.changeColumn('inventory_stock_transactions', 'transactionNumber', text(60))
  await qi.changeColumn('inventory_stock_transactions', 'date', date)
  const tables = await qi.showAllTables()
  if (tables.includes('inventory_purchase_order_items')) {
    await qi.sequelize
      .query(`INSERT INTO inventory_purchase_order_lines (id, createdBy, updatedBy, createdAt, updatedAt, purchaseOrderId, itemId, itemName, packType, packUnit, packQuantity, orderedQuantity, receivedQuantity, agreedPrice)
      SELECT l.id, l.createdBy, l.updatedBy, l.createdAt, l.updatedAt, l.purchaseOrderId, l.itemId, i.name, i.packType, i.packUnit, i.packQuantity, l.orderedQuantity, l.receivedQuantity, COALESCE(l.agreedPrice, 0)
      FROM inventory_purchase_order_items l JOIN inventory_items i ON i.id = l.itemId
      WHERE NOT EXISTS (SELECT 1 FROM inventory_purchase_order_lines n WHERE n.id = l.id)`)
  }
  if (tables.includes('inventory_stock_transaction_items')) {
    await qi.sequelize
      .query(`INSERT INTO inventory_stock_transaction_lines (id, createdBy, updatedBy, createdAt, updatedAt, transactionId, itemId, itemName, packType, packUnit, packQuantity, quantity, unitCost, mrpPrice, batchNumber, transitId, receivedDate, manufacturedDate, expiryDate)
      SELECT l.id, l.createdBy, l.updatedBy, l.createdAt, l.updatedAt, l.stockTransactionId, l.itemId, i.name, i.packType, i.packUnit, i.packQuantity, l.quantity, 0, 0, l.batchNumber, NULL, DATE(l.createdAt), NULL, l.expiryDate
      FROM inventory_stock_transaction_items l JOIN inventory_items i ON i.id = l.itemId
      WHERE NOT EXISTS (SELECT 1 FROM inventory_stock_transaction_lines n WHERE n.id = l.id)`)
  }
  await ensureIndex(qi, 'inventory_stock', ['locationId', 'itemId'], { unique: true, name: 'inv_stock_0_0_unique' })
  await ensureIndex(qi, 'inventory_purchase_orders', ['locationId', 'poNumber'], {
    unique: true,
    name: 'inv_stock_1_0_unique',
  })
  await ensureIndex(qi, 'inventory_purchase_orders', ['locationId', 'requestId'], {
    unique: true,
    name: 'inv_stock_1_1_unique',
  })
  await ensureIndex(qi, 'inventory_purchase_order_lines', ['purchaseOrderId', 'itemId'], {
    unique: true,
    name: 'inv_stock_2_0_unique',
  })
  await ensureIndex(qi, 'inventory_stock_transactions', ['locationId', 'requestId'], {
    unique: true,
    name: 'inv_stock_3_0_unique',
  })
  await ensureIndex(qi, 'inventory_stock_transactions', ['locationId', 'transactionNumber'], {
    unique: true,
    name: 'inv_stock_3_1_unique',
  })
  await ensureIndex(qi, 'inventory_stock_transactions', ['locationId', 'date'])
  await ensureIndex(qi, 'inventory_stock_transaction_lines', ['itemId', 'expiryDate'])
}
export async function down() {
  throw new Error('Center inventory upgrade is forward-only: preserve existing orders, stock, and receipt history')
}
