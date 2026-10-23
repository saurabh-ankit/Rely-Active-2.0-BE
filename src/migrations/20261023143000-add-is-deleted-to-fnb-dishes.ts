import { DataTypes, type QueryInterface } from 'sequelize'

// isDeleted was added to the already-executed create-fnb-module-tables migration,
// so databases that ran it earlier never got the column. Add it here if missing.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const dishCols = await queryInterface.describeTable('fnb_dishes')

  if (!dishCols.isDeleted) {
    await queryInterface.addColumn('fnb_dishes', 'isDeleted', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
    console.log('✅ Added column isDeleted to fnb_dishes table')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const dishCols = await queryInterface.describeTable('fnb_dishes')
  if (dishCols.isDeleted) {
    await queryInterface.removeColumn('fnb_dishes', 'isDeleted')
    console.log('✅ Removed column isDeleted from fnb_dishes table')
  }
}
