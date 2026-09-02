import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('global_service_properties')
  if (!tableDescription.quantity) {
    await queryInterface.addColumn('global_service_properties', 'quantity', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('global_service_properties')
  if (tableDescription.quantity) {
    await queryInterface.removeColumn('global_service_properties', 'quantity')
  }
}
