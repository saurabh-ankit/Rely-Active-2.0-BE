import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'asset_status_logs'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes(TABLE)) {
    console.log(`Table ${TABLE} not found; skipping documentUrl column.`)
    return
  }

  const cols = await queryInterface.describeTable(TABLE)
  if (!cols.documentUrl) {
    await queryInterface.addColumn(TABLE, 'documentUrl', {
      type: DataTypes.TEXT,
      allowNull: true,
    })
    console.log(`Added ${TABLE}.documentUrl`)
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes(TABLE)) return

  const cols = await queryInterface.describeTable(TABLE)
  if (cols.documentUrl) {
    await queryInterface.removeColumn(TABLE, 'documentUrl')
  }
}
