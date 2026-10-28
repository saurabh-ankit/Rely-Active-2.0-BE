import { QueryTypes, type QueryInterface } from 'sequelize'

/**
 * Drops the foreign key on fnb_resident_orders.mealSlotId.
 *
 * Orders store the *property* meal slot id (fnb_property_meal_slots, as sent by the apps and read
 * by placeMealOrder), but some databases (demo) carry a leftover constraint pointing the column at
 * fnb_global_meal_slots (e.g. fnb_resident_orders_ibfk_4). Every property slot id fails it, so
 * every meal order failed with ER_NO_REFERENCED_ROW_2. Dev has no constraint on this column.
 *
 * Constraint names differ between databases, so they are looked up. Does nothing where there is
 * none, and does not hide errors.
 */

const TABLE = 'fnb_resident_orders'
const COLUMN = 'mealSlotId'

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

/** Drops every foreign key on `table`.mealSlotId; returns their names. */
export async function dropMealSlotForeignKeys(queryInterface: QueryInterface, table = TABLE): Promise<string[]> {
  const constraints = await foreignKeysOn(queryInterface, table, COLUMN)
  for (const constraint of constraints) {
    await queryInterface.removeConstraint(table, constraint)
  }
  return constraints
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const names = tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
  if (!names.includes(TABLE)) return

  const dropped = await dropMealSlotForeignKeys(queryInterface)
  console.log(
    dropped.length
      ? `✅ Dropped ${TABLE}.${COLUMN} foreign key(s): ${dropped.join(', ')}`
      : `✅ ${TABLE}.${COLUMN} has no foreign key (nothing to do)`,
  )
}

/** Not restored: the constraint pointed at the wrong table and blocked every order. */
export async function down(): Promise<void> {}
