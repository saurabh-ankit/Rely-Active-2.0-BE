import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const invoiceCols = await queryInterface.describeTable('billing_invoices')

  if (!invoiceCols.discountNote) {
    await queryInterface.addColumn('billing_invoices', 'discountNote', {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Reason or approval notes for discount / concession applied to invoice',
    })
    console.log('✅ Added discountNote column to billing_invoices')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const invoiceCols = await queryInterface.describeTable('billing_invoices')
  if (invoiceCols.discountNote) {
    await queryInterface.removeColumn('billing_invoices', 'discountNote')
  }
}
