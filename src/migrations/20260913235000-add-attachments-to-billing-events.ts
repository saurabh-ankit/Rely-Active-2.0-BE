import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const columns = await queryInterface.describeTable('billing_events')
  if (!columns.attachments) {
    await queryInterface.addColumn('billing_events', 'attachments', {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Supporting receipts and bills for manual billing events',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const columns = await queryInterface.describeTable('billing_events')
  if (columns.attachments) await queryInterface.removeColumn('billing_events', 'attachments')
}
