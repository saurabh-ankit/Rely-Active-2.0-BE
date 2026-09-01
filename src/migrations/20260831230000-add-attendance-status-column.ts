import { type QueryInterface, DataTypes } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const datesTable = await queryInterface.describeTable('roster_assignment_dates')

  if (!datesTable.attendance_status) {
    await queryInterface.addColumn('roster_assignment_dates', 'attendance_status', {
      type: DataTypes.ENUM('NOT_MARKED', 'PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE'),
      allowNull: false,
      defaultValue: 'NOT_MARKED',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.removeColumn('roster_assignment_dates', 'attendance_status')
}
