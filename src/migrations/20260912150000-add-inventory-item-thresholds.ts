import { DataTypes, type QueryInterface } from 'sequelize'

const columns = ['minQuantity', 'maxQuantity', 'threshold'] as const

export async function up({ context: qi }: { context: QueryInterface }) {
  const existing = await qi.describeTable('inventory_items')
  for (const column of columns) {
    if (!existing[column])
      await qi.addColumn('inventory_items', column, {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      })
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  const existing = await qi.describeTable('inventory_items')
  for (const column of columns) {
    if (existing[column]) await qi.removeColumn('inventory_items', column)
  }
}
