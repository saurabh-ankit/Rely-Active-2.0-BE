import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('venues')
  if (!tableDescription.price) {
    await queryInterface.addColumn('venues', 'price', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('venues')
  if (tableDescription.price) {
    await queryInterface.removeColumn('venues', 'price')
  }
}
