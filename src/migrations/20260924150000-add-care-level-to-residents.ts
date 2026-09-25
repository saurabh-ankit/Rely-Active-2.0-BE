import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const residentCols = await queryInterface.describeTable('residents')

  if (!residentCols.careLevel) {
    await queryInterface.addColumn('residents', 'careLevel', {
      type: DataTypes.ENUM('STABLE', 'MODERATE', 'CRITICAL'),
      allowNull: true,
      defaultValue: 'STABLE',
      comment: 'Resident health/care acuity level (STABLE, MODERATE, CRITICAL)',
    })
    console.log('✅ Added column careLevel to residents table')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const residentCols = await queryInterface.describeTable('residents')
  if (residentCols.careLevel) {
    await queryInterface.removeColumn('residents', 'careLevel')
    console.log('✅ Removed column careLevel from residents table')
  }
}
