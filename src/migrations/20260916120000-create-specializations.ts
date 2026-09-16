import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Doctor specializations catalog (`specializations`) and the many-to-many link
 * to doctors (`doctor_specializations`). The catalog starts empty and is
 * managed from Global Settings → Doctor Specializations.
 */

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (!tableNames.includes('specializations')) {
    await queryInterface.createTable('specializations', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: DataTypes.STRING(150), allowNull: false },
      code: { type: DataTypes.STRING(50), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })
    await queryInterface.addIndex('specializations', ['code'], {
      name: 'specializations_code_unique',
      unique: true,
    })
    await queryInterface.addIndex('specializations', ['isActive', 'isDeleted'], {
      name: 'specializations_active_idx',
    })
  }

  if (!tableNames.includes('doctor_specializations')) {
    await queryInterface.createTable('doctor_specializations', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      specializationId: { type: DataTypes.UUID, allowNull: false },
      isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })
    await queryInterface.addIndex('doctor_specializations', ['userId', 'specializationId'], {
      name: 'doctor_specializations_user_spec_unique',
      unique: true,
    })
    // Serves "which doctors hold specialization X" straight from the index.
    await queryInterface.addIndex('doctor_specializations', ['specializationId', 'userId'], {
      name: 'doctor_specializations_spec_user_idx',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (tableNames.includes('doctor_specializations')) {
    await queryInterface.dropTable('doctor_specializations')
  }
  if (tableNames.includes('specializations')) {
    await queryInterface.dropTable('specializations')
  }
}
