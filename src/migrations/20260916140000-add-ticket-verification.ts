import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Verification step after a staff member completes a ticket: an admin reviews the
 * resident's request and the staff's completion report, then verifies (closes) it.
 */

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (!tableNames.includes('tickets')) return

  const columns = await queryInterface.describeTable('tickets')

  if (!columns.verifiedAt) {
    await queryInterface.addColumn('tickets', 'verifiedAt', { type: DataTypes.DATE, allowNull: true })
  }
  if (!columns.verifiedByUserId) {
    await queryInterface.addColumn('tickets', 'verifiedByUserId', { type: DataTypes.UUID, allowNull: true })
  }
  if (!columns.verificationNotes) {
    await queryInterface.addColumn('tickets', 'verificationNotes', { type: DataTypes.TEXT, allowNull: true })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (!tableNames.includes('tickets')) return

  const columns = await queryInterface.describeTable('tickets')
  for (const column of ['verificationNotes', 'verifiedByUserId', 'verifiedAt']) {
    if (columns[column]) await queryInterface.removeColumn('tickets', column)
  }
}
