import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('property_units')
  if (!tableDescription.occupancyStatus) {
    await queryInterface.addColumn('property_units', 'occupancyStatus', {
      type: DataTypes.ENUM('VACANT', 'OWNER_OCCUPIED', 'TENANT_OCCUPIED'),
      allowNull: false,
      defaultValue: 'VACANT',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('property_units')
  if (tableDescription.occupancyStatus) {
    await queryInterface.removeColumn('property_units', 'occupancyStatus')
  }
}
