import { DataTypes, type QueryInterface } from 'sequelize'

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

async function hasIndex(queryInterface: QueryInterface, tableName: string, indexName: string): Promise<boolean> {
  const indexes = (await queryInterface.showIndex(tableName)) as Array<{ name?: string }>
  return indexes.some((idx) => idx.name === indexName)
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes('amenities')) return

  const columns = await queryInterface.describeTable('amenities')

  if (columns.code) {
    if (await hasIndex(queryInterface, 'amenities', 'amenities_code_unique')) {
      await queryInterface.removeIndex('amenities', 'amenities_code_unique')
    }
    await queryInterface.removeColumn('amenities', 'code')
  }

  if (columns.category) {
    await queryInterface.removeColumn('amenities', 'category')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes('amenities')) return

  const columns = await queryInterface.describeTable('amenities')

  if (!columns.code) {
    await queryInterface.addColumn('amenities', 'code', {
      type: DataTypes.STRING(80),
      allowNull: true,
    })
  }

  if (!columns.category) {
    await queryInterface.addColumn('amenities', 'category', {
      type: DataTypes.STRING(80),
      allowNull: true,
    })
  }
}
