import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'assets'
const COLUMN = 'qrCodeImage'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes(TABLE)) {
    console.log(`${TABLE} table missing, skipping ${COLUMN} migration.`)
    return
  }

  const cols = await queryInterface.describeTable(TABLE)
  if (!cols[COLUMN]) {
    await queryInterface.addColumn(TABLE, COLUMN, {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
    console.log(`Added ${COLUMN} to ${TABLE}.`)
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
