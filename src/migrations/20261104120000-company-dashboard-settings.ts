import { DataTypes, type QueryInterface } from 'sequelize'

/** Dashboard tabs shown for a company: one row per company, applied to all of its properties. */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = (await queryInterface.showAllTables()).map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (tables.includes('company_dashboard_settings')) return
  await queryInterface.createTable('company_dashboard_settings', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      unique: true,
      references: { model: 'company', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    visibleTabs: { type: DataTypes.JSON, allowNull: false },
    createdBy: { type: DataTypes.CHAR(36), allowNull: true },
    updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = (await queryInterface.showAllTables()).map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (tables.includes('company_dashboard_settings')) await queryInterface.dropTable('company_dashboard_settings')
}
