import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Resident medication administrations: one row per medication/insulin dose a nurse marks as given
 * or cancels. A cancelled dose keeps its cancellation details even if it is completed later, so
 * completedBy / completedAt are nullable.
 */

const TABLE = 'resident_medication_administrations'

const auditColumns = {
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}

const idColumn = {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
}

const cancellationColumns = {
  cancelledBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  cancelledAt: { type: DataTypes.DATE, allowNull: true },
  cancelReason: { type: DataTypes.TEXT, allowNull: true },
  cancelAttachments: { type: DataTypes.JSON, allowNull: true },
  cancelVoiceNotes: { type: DataTypes.JSON, allowNull: true },
}

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

async function addCancellationSupport(queryInterface: QueryInterface): Promise<void> {
  const cols = await queryInterface.describeTable(TABLE)
  if (cols.cancelledBy) return

  await queryInterface.sequelize.query(
    `ALTER TABLE ${TABLE}
      MODIFY COLUMN status ENUM('COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'COMPLETED',
      MODIFY COLUMN completedBy CHAR(36) BINARY NULL,
      MODIFY COLUMN completedAt DATETIME NULL`,
  )
  for (const [column, definition] of Object.entries(cancellationColumns)) {
    if (!cols[column]) await queryInterface.addColumn(TABLE, column, definition)
  }
  console.log(`✅ Added cancellation columns to ${TABLE}`)
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) {
    await addCancellationSupport(queryInterface)
    return
  }

  await queryInterface.createTable(TABLE, {
    ...idColumn,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'residents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    kind: { type: DataTypes.ENUM('MEDICATION', 'INSULIN'), allowNull: false },
    medicationId: { type: DataTypes.UUID, allowNull: false },
    inventoryItemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_items', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    medicineName: { type: DataTypes.STRING(255), allowNull: false },
    timeOfDay: { type: DataTypes.STRING(20), allowNull: false },
    scheduledDate: { type: DataTypes.DATEONLY, allowNull: false },
    scheduledTime: { type: DataTypes.STRING(10), allowNull: false },
    dose: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    route: { type: DataTypes.STRING(30), allowNull: false },
    mealTiming: { type: DataTypes.STRING(30), allowNull: false },
    status: { type: DataTypes.ENUM('COMPLETED', 'CANCELLED'), allowNull: false, defaultValue: 'COMPLETED' },
    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    attachments: { type: DataTypes.JSON, allowNull: false },
    voiceNotes: { type: DataTypes.JSON, allowNull: false },
    stockStatus: {
      type: DataTypes.ENUM('DEDUCTED', 'INSUFFICIENT', 'NOT_APPLICABLE'),
      allowNull: false,
      defaultValue: 'NOT_APPLICABLE',
    },
    deductedQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    stockTransactionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'inventory_stock_transactions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    ...cancellationColumns,
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...auditColumns,
  })

  await queryInterface.addIndex(TABLE, ['kind', 'medicationId', 'timeOfDay', 'scheduledDate'], {
    unique: true,
    name: 'uq_resident_med_admin_slot',
  })
  await queryInterface.addIndex(TABLE, ['residentId', 'scheduledDate'], {
    name: 'idx_resident_med_admin_resident_date',
  })
  await queryInterface.addIndex(TABLE, ['completedBy', 'scheduledDate'], {
    name: 'idx_resident_med_admin_nurse_date',
  })
  console.log(`✅ Created table ${TABLE}`)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) await queryInterface.dropTable(TABLE)
}
