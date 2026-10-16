import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Resident fluid balance: fluid intake, fluid output and bowel movement entries recorded by nurses.
 * One row per entry; rows saved together share a batchId. Intakes carry an IV fluid type (IV) or a
 * free-text description (Oral / NG, e.g. Water, Juice); outputs carry who collected them.
 */

const TABLE = 'resident_fluid_balances'

const auditColumns = {
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}

const idColumn = {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
}

const detailColumns = {
  ivFluidType: {
    type: DataTypes.ENUM('ns', 'ns_with_injection', 'dns', 'rl', 'd5', 'd25'),
    allowNull: true,
  },
  description: { type: DataTypes.STRING(150), allowNull: true },
  collectedBy: { type: DataTypes.STRING(150), allowNull: true },
}

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

async function addMissingDetailColumns(queryInterface: QueryInterface): Promise<void> {
  const cols = await queryInterface.describeTable(TABLE)
  for (const [column, definition] of Object.entries(detailColumns)) {
    if (!cols[column]) await queryInterface.addColumn(TABLE, column, definition)
  }
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) {
    await addMissingDetailColumns(queryInterface)
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
    batchId: { type: DataTypes.UUID, allowNull: false },
    category: { type: DataTypes.ENUM('INTAKE', 'OUTPUT', 'BOWEL'), allowNull: false },
    fluidType: { type: DataTypes.STRING(30), allowNull: true },
    ...detailColumns,
    quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    unit: { type: DataTypes.ENUM('ml', 'l'), allowNull: true },
    quantityMl: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    stoolType: { type: DataTypes.ENUM('hard', 'normal', 'loose'), allowNull: true },
    comfortLevel: { type: DataTypes.ENUM('easy', 'strained', 'painful'), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    recordedAt: { type: DataTypes.DATE, allowNull: false },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...auditColumns,
  })

  await queryInterface.addIndex(TABLE, ['residentId', 'recordedAt'], {
    name: 'idx_resident_fluid_balances_resident_recorded',
  })
  await queryInterface.addIndex(TABLE, ['batchId'], {
    name: 'idx_resident_fluid_balances_batch',
  })
  console.log(`✅ Created table ${TABLE}`)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) await queryInterface.dropTable(TABLE)
}
