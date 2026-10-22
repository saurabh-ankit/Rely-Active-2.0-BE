import type { QueryInterface } from 'sequelize'

/**
 * The resident NOK (next of kin) module was removed; drop its table if present.
 * `down` is a no-op — NOK is not restored.
 */

const TABLE = 'resident_nok_contacts'

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes(TABLE)) return
  await queryInterface.dropTable(TABLE)
  console.log(`✅ Dropped table ${TABLE}`)
}

export async function down(_args: { context: QueryInterface }): Promise<void> {
  // NOK was removed; do not recreate the table.
}
