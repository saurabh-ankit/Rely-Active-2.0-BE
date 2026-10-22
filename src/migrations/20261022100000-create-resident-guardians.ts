import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Resident guardians: a family member who does not live in the flat (e.g. a son abroad) and
 * logs in to the resident app to look after the parents residing there. Onboarded by the admin
 * against the flat's resident account, separately from family members.
 */

const TABLE = 'resident_guardians'

const auditColumns = {
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) return

  await queryInterface.createTable(TABLE, {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'residents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'The flat (household) whose residents this guardian looks after',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: true },
    relation: { type: DataTypes.STRING(50), allowNull: false },
    gender: { type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    photoUrl: { type: DataTypes.TEXT('long'), allowNull: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...auditColumns,
  })

  await queryInterface.addIndex(TABLE, ['residentId'], { name: 'idx_resident_guardians_resident' })
  await queryInterface.addIndex(TABLE, ['phone'], { name: 'idx_resident_guardians_phone' })
  await queryInterface.addIndex(TABLE, ['email'], { name: 'idx_resident_guardians_email' })
  console.log(`✅ Created table ${TABLE}`)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) await queryInterface.dropTable(TABLE)
}
