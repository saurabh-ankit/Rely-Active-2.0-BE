import { DataTypes, type QueryInterface } from 'sequelize'
const fields = ['minQuantity', 'maxQuantity', 'threshold'] as const
export async function up({ context: qi }: { context: QueryInterface }) {
  const columns = await qi.describeTable('inventory_item_locations')
  for (const field of fields) {
    if (!columns[field]) {
      // Nullable until backfilled, so an interrupted migration can safely resume.
      await qi.addColumn('inventory_item_locations', field, { type: DataTypes.INTEGER.UNSIGNED, allowNull: true })
    }
    await qi.sequelize.query(
      `UPDATE inventory_item_locations l JOIN inventory_items i ON i.id = l.itemId SET l.${field} = i.${field} WHERE l.${field} IS NULL`,
    )
    await qi.changeColumn('inventory_item_locations', field, {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    })
  }
}
export async function down({ context: qi }: { context: QueryInterface }) {
  const columns = await qi.describeTable('inventory_item_locations')
  for (const field of fields) if (columns[field]) await qi.removeColumn('inventory_item_locations', field)
}
