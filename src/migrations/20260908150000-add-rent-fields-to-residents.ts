import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const residentCols = await queryInterface.describeTable('residents')

  if (!residentCols.rentAmount) {
    await queryInterface.addColumn('residents', 'rentAmount', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Agreed monthly rent amount for tenant',
    })
  }

  if (!residentCols.payRentToCompany) {
    await queryInterface.addColumn('residents', 'payRentToCompany', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether rent is collected via company billing system or paid directly to owner',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const residentCols = await queryInterface.describeTable('residents')
  if (residentCols.rentAmount) {
    await queryInterface.removeColumn('residents', 'rentAmount')
  }
  if (residentCols.payRentToCompany) {
    await queryInterface.removeColumn('residents', 'payRentToCompany')
  }
}
