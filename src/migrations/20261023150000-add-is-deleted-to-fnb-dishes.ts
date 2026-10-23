import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * `20260831130000-create-fnb-module-tables` was edited in place to add `fnb_dishes.isDeleted`
 * after that migration had already run on existing DBs. Sequelize will not re-execute it, so
 * soft-delete failed on those environments. This dedicated migration adds the column if missing.
 */
const TABLE = 'fnb_dishes'
const COLUMN = 'isDeleted'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const names = tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
  if (!names.includes(TABLE)) return

  const cols = await queryInterface.describeTable(TABLE)
  if (!cols[COLUMN]) {
    await queryInterface.addColumn(TABLE, COLUMN, {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Soft-delete flag for dishes catalogue',
    })
    console.log(`✅ Added ${TABLE}.${COLUMN}`)
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const names = tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
  if (!names.includes(TABLE)) return

  const cols = await queryInterface.describeTable(TABLE)
  if (cols[COLUMN]) {
    await queryInterface.removeColumn(TABLE, COLUMN)
  }
}
