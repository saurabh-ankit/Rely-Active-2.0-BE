import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * First-class escalation fields. Escalation used to be recorded only as an
 * `[ESCALATED ...]` line appended to `resolutionNotes`, which the web app could
 * not read reliably.
 */

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (!tableNames.includes('tickets')) return

  const columns = await queryInterface.describeTable('tickets')

  if (!columns.escalatedAt) {
    await queryInterface.addColumn('tickets', 'escalatedAt', { type: DataTypes.DATE, allowNull: true })
  }
  if (!columns.escalatedByUserId) {
    await queryInterface.addColumn('tickets', 'escalatedByUserId', { type: DataTypes.UUID, allowNull: true })
  }
  if (!columns.escalatedByName) {
    await queryInterface.addColumn('tickets', 'escalatedByName', { type: DataTypes.STRING(255), allowNull: true })
  }
  if (!columns.escalationReason) {
    await queryInterface.addColumn('tickets', 'escalationReason', { type: DataTypes.TEXT, allowNull: true })
  }

  // Backfill tickets escalated before these columns existed.
  await queryInterface.sequelize.query(
    "UPDATE tickets SET escalatedAt = updatedAt WHERE escalatedAt IS NULL AND resolutionNotes LIKE '%[ESCALATED%'",
  )
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (!tableNames.includes('tickets')) return

  const columns = await queryInterface.describeTable('tickets')
  for (const column of ['escalationReason', 'escalatedByName', 'escalatedByUserId', 'escalatedAt']) {
    if (columns[column]) await queryInterface.removeColumn('tickets', column)
  }
}
