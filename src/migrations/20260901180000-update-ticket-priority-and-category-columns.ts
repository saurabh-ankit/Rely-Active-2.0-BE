import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('tickets')

  if (tableDescription.priority) {
    await queryInterface.changeColumn('tickets', 'priority', {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'MEDIUM',
    })
  }

  if (tableDescription.category) {
    await queryInterface.changeColumn('tickets', 'category', {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: 'REPAIR_MAINTENANCE',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('tickets')

  if (tableDescription.priority) {
    await queryInterface.changeColumn('tickets', 'priority', {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'MEDIUM',
    })
  }

  if (tableDescription.category) {
    await queryInterface.changeColumn('tickets', 'category', {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: 'REPAIR_MAINTENANCE',
    })
  }
}
