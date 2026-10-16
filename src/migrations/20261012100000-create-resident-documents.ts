import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Resident documents: files uploaded against a resident from the Medical > Documents tab.
 */

const TABLE = 'resident_documents'

const auditColumns = {
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}

const idColumn = {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
}

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) return

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
    name: { type: DataTypes.STRING(255), allowNull: false },
    fileUrl: { type: DataTypes.STRING(1000), allowNull: false },
    fileName: { type: DataTypes.STRING(255), allowNull: true },
    mimeType: { type: DataTypes.STRING(100), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...auditColumns,
  })

  await queryInterface.addIndex(TABLE, ['residentId'], { name: 'idx_resident_documents_resident' })
  await queryInterface.addIndex(TABLE, ['isDeleted', 'createdAt'], { name: 'idx_resident_documents_deleted_created' })
  console.log(`✅ Created table ${TABLE}`)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) await queryInterface.dropTable(TABLE)
}
