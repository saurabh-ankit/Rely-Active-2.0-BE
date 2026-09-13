import { DataTypes, type QueryInterface } from 'sequelize'
export async function up({ context: qi }: { context: QueryInterface }) {
  const columns = await qi.describeTable('inventory_stock_transactions')
  for (const [name, table] of [
    ['residentId', 'residents'],
    ['assignedUserId', 'users'],
  ] as const) {
    if (!columns[name])
      await qi.addColumn('inventory_stock_transactions', name, {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: table, key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
  }
  if (!columns.recipientName)
    await qi.addColumn('inventory_stock_transactions', 'recipientName', {
      type: DataTypes.STRING(255),
      allowNull: true,
    })
  if (!(await qi.showAllTables()).includes('inventory_issue_allocations')) {
    const fk = {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_stock_transaction_lines', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    }
    await qi.createTable('inventory_issue_allocations', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
      receiptLineId: fk,
      issueLineId: { ...fk, unique: true },
      quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      mrpAmount: { type: DataTypes.DECIMAL(24, 2), allowNull: false },
    })
  }
}
export async function down() {
  throw new Error('Forward-only migration: preserve issue allocation and recipient history')
}
