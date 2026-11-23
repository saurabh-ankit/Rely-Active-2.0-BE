import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'care_task_assignments'
const COLUMN = 'durationMinutes'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes(TABLE)) {
    console.log(`Table ${TABLE} not found; skipping ${COLUMN} column.`)
    return
  }

  const cols = await queryInterface.describeTable(TABLE)
  if (!cols[COLUMN]) {
    await queryInterface.addColumn(TABLE, COLUMN, {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15,
      comment: 'Task duration in minutes',
    })
    console.log(`Added ${TABLE}.${COLUMN}`)
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes(TABLE)) return

  const cols = await queryInterface.describeTable(TABLE)
  if (cols[COLUMN]) {
    await queryInterface.removeColumn(TABLE, COLUMN)
  }
}
