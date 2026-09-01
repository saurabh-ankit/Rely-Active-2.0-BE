import { type QueryInterface, DataTypes } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // Add columns to roster_assignments table
  const assignmentsTable = await queryInterface.describeTable('roster_assignments')

  if (!assignmentsTable.duty_type) {
    await queryInterface.addColumn('roster_assignments', 'duty_type', {
      type: DataTypes.ENUM('SHIFT', 'OPD_SESSION', 'ON_CALL', 'EMERGENCY', 'AD_HOC'),
      allowNull: false,
      defaultValue: 'SHIFT',
    })
  }

  if (!assignmentsTable.holiday_policy) {
    await queryInterface.addColumn('roster_assignments', 'holiday_policy', {
      type: DataTypes.ENUM('IGNORE', 'SKIP', 'RESCHEDULE', 'REQUIRE_COVERAGE'),
      allowNull: false,
      defaultValue: 'SKIP',
    })
  }

  if (!assignmentsTable.cancellation_reason) {
    await queryInterface.addColumn('roster_assignments', 'cancellation_reason', {
      type: DataTypes.STRING(255),
      allowNull: true,
    })
  }

  if (!assignmentsTable.cancelled_by) {
    await queryInterface.addColumn('roster_assignments', 'cancelled_by', {
      type: DataTypes.STRING(100),
      allowNull: true,
    })
  }

  if (!assignmentsTable.cancelled_at) {
    await queryInterface.addColumn('roster_assignments', 'cancelled_at', {
      type: DataTypes.DATE,
      allowNull: true,
    })
  }

  // Add columns to roster_assignment_dates table
  const datesTable = await queryInterface.describeTable('roster_assignment_dates')

  if (!datesTable.duty_type) {
    await queryInterface.addColumn('roster_assignment_dates', 'duty_type', {
      type: DataTypes.ENUM('SHIFT', 'OPD_SESSION', 'ON_CALL', 'EMERGENCY', 'AD_HOC'),
      allowNull: false,
      defaultValue: 'SHIFT',
    })
  }

  if (!datesTable.cancellation_reason) {
    await queryInterface.addColumn('roster_assignment_dates', 'cancellation_reason', {
      type: DataTypes.STRING(255),
      allowNull: true,
    })
  }

  if (!datesTable.cancelled_by) {
    await queryInterface.addColumn('roster_assignment_dates', 'cancelled_by', {
      type: DataTypes.STRING(100),
      allowNull: true,
    })
  }

  if (!datesTable.cancelled_at) {
    await queryInterface.addColumn('roster_assignment_dates', 'cancelled_at', {
      type: DataTypes.DATE,
      allowNull: true,
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.removeColumn('roster_assignments', 'duty_type')
  await queryInterface.removeColumn('roster_assignments', 'holiday_policy')
  await queryInterface.removeColumn('roster_assignments', 'cancellation_reason')
  await queryInterface.removeColumn('roster_assignments', 'cancelled_by')
  await queryInterface.removeColumn('roster_assignments', 'cancelled_at')

  await queryInterface.removeColumn('roster_assignment_dates', 'duty_type')
  await queryInterface.removeColumn('roster_assignment_dates', 'cancellation_reason')
  await queryInterface.removeColumn('roster_assignment_dates', 'cancelled_by')
  await queryInterface.removeColumn('roster_assignment_dates', 'cancelled_at')
}
