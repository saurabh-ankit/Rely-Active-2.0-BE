import { DataTypes, QueryTypes, type ModelAttributeColumnOptions, type QueryInterface } from 'sequelize'

/**
 * Finishes removing the legacy columns of fnb_resident_orders.
 *
 * 20260902220000-fnb-module-schema-updates dropped these with errors ignored. Where dishId /
 * menuItemId still had their foreign keys, MySQL refused to drop them, so some databases (demo)
 * kept NOT NULL columns the order model no longer writes, and every new meal order failed with
 * "Field '…' doesn't have a default value".
 *
 * Drops each column's foreign keys first, then the column (MySQL removes a dropped column from
 * any index it is part of). Does nothing where the columns are already gone, and does not hide
 * errors.
 */

const TABLE = 'fnb_resident_orders'
const LEGACY_COLUMNS = ['dishId', 'menuItemId', 'mealSlot', 'guestName', 'guestCount', 'cutoffTime'] as const

async function existingColumns(queryInterface: QueryInterface, table: string): Promise<Set<string>> {
  const columns = await queryInterface.describeTable(table)
  return new Set(Object.keys(columns))
}

/** Foreign key names on a column (they differ between databases, so they are looked up). */
async function foreignKeysOn(queryInterface: QueryInterface, table: string, column: string): Promise<string[]> {
  const rows = await queryInterface.sequelize.query<{ name: string }>(
    `SELECT DISTINCT CONSTRAINT_NAME AS name
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND COLUMN_NAME = :column
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    { replacements: { table, column }, type: QueryTypes.SELECT },
  )
  return rows.map((row) => row.name)
}

/** Drops the legacy columns still present on `table`; returns the ones it dropped. */
export async function dropLegacyOrderColumns(queryInterface: QueryInterface, table = TABLE): Promise<string[]> {
  const present = await existingColumns(queryInterface, table)
  const toDrop = LEGACY_COLUMNS.filter((column) => present.has(column))

  for (const column of toDrop) {
    for (const constraint of await foreignKeysOn(queryInterface, table, column)) {
      await queryInterface.removeConstraint(table, constraint)
    }
    await queryInterface.removeColumn(table, column)
  }
  return toDrop
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const names = tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
  if (!names.includes(TABLE)) return

  const dropped = await dropLegacyOrderColumns(queryInterface)
  console.log(
    dropped.length
      ? `✅ Dropped legacy ${TABLE} columns: ${dropped.join(', ')}`
      : `✅ ${TABLE} has no legacy columns (nothing to do)`,
  )
}

/**
 * Puts the columns back as nullable (their data is not restored), so a rollback can't break order
 * creation again.
 */
export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const present = await existingColumns(queryInterface, TABLE)
  const definitions: Record<(typeof LEGACY_COLUMNS)[number], ModelAttributeColumnOptions> = {
    dishId: { type: DataTypes.UUID, allowNull: true },
    menuItemId: { type: DataTypes.UUID, allowNull: true },
    mealSlot: { type: DataTypes.ENUM('breakfast', 'lunch', 'snacks', 'dinner'), allowNull: true },
    guestName: { type: DataTypes.STRING(255), allowNull: true },
    guestCount: { type: DataTypes.INTEGER, allowNull: true },
    cutoffTime: { type: DataTypes.TIME, allowNull: true },
  }
  for (const column of LEGACY_COLUMNS) {
    if (!present.has(column)) await queryInterface.addColumn(TABLE, column, definitions[column])
  }
}
