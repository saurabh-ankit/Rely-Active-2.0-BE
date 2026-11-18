import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Creates company_dashboard_settings before 20261104120000-company-dashboard-settings runs.
 *
 * That migration declares companyId as plain CHAR(36), which takes the database's default collation
 * (utf8mb4_0900_ai_ci), while company.id is a Sequelize UUID (CHAR(36) BINARY, utf8mb4_bin). MySQL rejects
 * the foreign key between them (ER_FK_INCOMPATIBLE_COLUMNS). This migration is dated just before it and
 * creates the same table with companyId as UUID, so the later migration finds the table and skips.
 * Where the table already exists (the later migration already ran), it does nothing.
 */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = (await queryInterface.showAllTables()).map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (tables.includes('company_dashboard_settings')) return
  await queryInterface.createTable('company_dashboard_settings', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.UUID,
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

/** The table belongs to 20261104120000-company-dashboard-settings, whose down drops it. */
export async function down(): Promise<void> {}
