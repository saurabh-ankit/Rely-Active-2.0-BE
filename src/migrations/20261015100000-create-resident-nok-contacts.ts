import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Resident NOK (next of kin) contacts managed from the resident Profile tab.
 */

const TABLE = 'resident_nok_contacts'

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
    fullName: { type: DataTypes.STRING(150), allowNull: false },
    relationship: { type: DataTypes.STRING(50), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    alternatePhone: { type: DataTypes.STRING(20), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    photoUrl: { type: DataTypes.TEXT('long'), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...auditColumns,
  })

  await queryInterface.addIndex(TABLE, ['residentId'], { name: 'idx_resident_nok_contacts_resident' })
  await queryInterface.addIndex(TABLE, ['isDeleted', 'createdAt'], {
    name: 'idx_resident_nok_contacts_deleted_created',
  })
  console.log(`✅ Created table ${TABLE}`)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) await queryInterface.dropTable(TABLE)
}
