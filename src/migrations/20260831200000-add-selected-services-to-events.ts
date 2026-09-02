import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('events')
  if (!tableDescription.selectedServices) {
    await queryInterface.addColumn('events', 'selectedServices', {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Array of selected venue add-on services (snapshot)',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('events')
  if (tableDescription.selectedServices) {
    await queryInterface.removeColumn('events', 'selectedServices')
  }
}
