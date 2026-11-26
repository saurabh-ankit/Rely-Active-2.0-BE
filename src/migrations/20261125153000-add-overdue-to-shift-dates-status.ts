import type { QueryInterface } from 'sequelize'

const TABLE = 'shift_dates'

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

/**
 * Add `overdue` to shift_dates.status for housekeeping tasks past window
 * that were started/not completed (or never started).
 */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes(TABLE)) {
    console.log(`Table ${TABLE} not found; skipping overdue status migration.`)
    return
  }

  await queryInterface.sequelize.query(
    `ALTER TABLE \`${TABLE}\` MODIFY COLUMN \`status\` ENUM('upcoming', 'on_duty', 'completed', 'overdue', 'absent', 'covered', 'day_off') NOT NULL DEFAULT 'upcoming'`,
  )
  console.log(`Updated ${TABLE}.status enum to include overdue`)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes(TABLE)) return

  await queryInterface.sequelize.query(`UPDATE \`${TABLE}\` SET \`status\` = 'completed' WHERE \`status\` = 'overdue'`)
  await queryInterface.sequelize.query(
    `ALTER TABLE \`${TABLE}\` MODIFY COLUMN \`status\` ENUM('upcoming', 'on_duty', 'completed', 'absent', 'covered', 'day_off') NOT NULL DEFAULT 'upcoming'`,
  )
}
