import { DataTypes, type QueryInterface } from 'sequelize'

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes('amenities')) return

  const columns = await queryInterface.describeTable('amenities')
  if (columns.isSlotBookableDefault) {
    await queryInterface.removeColumn('amenities', 'isSlotBookableDefault')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes('amenities')) return

  const columns = await queryInterface.describeTable('amenities')
  if (!columns.isSlotBookableDefault) {
    await queryInterface.addColumn('amenities', 'isSlotBookableDefault', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }
}
