import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'asset_item_requests'
const COLUMN = 'serviceLogId'
const INDEX_NAME = 'asset_item_requests_service_log_id_unique'

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
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'asset_service_logs', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
    console.log(`Added ${COLUMN} to ${TABLE}.`)
  }

  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name: string }>
  if (!indexes.some((index) => index.name === INDEX_NAME)) {
    await queryInterface.addIndex(TABLE, [COLUMN], {
      name: INDEX_NAME,
      unique: true,
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes(TABLE)) return

  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name: string }>
  if (indexes.some((index) => index.name === INDEX_NAME)) {
    await queryInterface.removeIndex(TABLE, INDEX_NAME)
  }

  const cols = await queryInterface.describeTable(TABLE)
  if (cols[COLUMN]) {
    await queryInterface.removeColumn(TABLE, COLUMN)
  }
}
