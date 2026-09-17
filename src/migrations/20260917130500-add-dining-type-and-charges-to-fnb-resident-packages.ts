import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableCols = (await queryInterface.describeTable('fnb_resident_packages')) as Record<string, unknown>

  if (!tableCols.diningType) {
    await queryInterface.addColumn('fnb_resident_packages', 'diningType', {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: 'dine_in',
    })
    console.log("✅ Added 'diningType' to fnb_resident_packages")
  }

  if (!tableCols.deliveryCharge) {
    await queryInterface.addColumn('fnb_resident_packages', 'deliveryCharge', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.0,
    })
    console.log("✅ Added 'deliveryCharge' to fnb_resident_packages")
  }

  if (!tableCols.totalPrice) {
    await queryInterface.addColumn('fnb_resident_packages', 'totalPrice', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    })
    console.log("✅ Added 'totalPrice' to fnb_resident_packages")
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableCols = (await queryInterface.describeTable('fnb_resident_packages')) as Record<string, unknown>

  if (tableCols.totalPrice) {
    await queryInterface.removeColumn('fnb_resident_packages', 'totalPrice')
  }
  if (tableCols.deliveryCharge) {
    await queryInterface.removeColumn('fnb_resident_packages', 'deliveryCharge')
  }
  if (tableCols.diningType) {
    await queryInterface.removeColumn('fnb_resident_packages', 'diningType')
  }
}
