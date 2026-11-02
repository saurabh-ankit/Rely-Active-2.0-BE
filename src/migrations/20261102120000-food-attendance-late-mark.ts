import { DataTypes, type QueryInterface } from 'sequelize'

/** Dine-in attendance marked after its meal slot ended (allowed up to 3 days back) is flagged as late. */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const cols = await queryInterface.describeTable('fnb_food_attendances')
  if (!cols.marked_late) {
    await queryInterface.addColumn('fnb_food_attendances', 'marked_late', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Marked after the meal slot had ended',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const cols = await queryInterface.describeTable('fnb_food_attendances')
  if (cols.marked_late) await queryInterface.removeColumn('fnb_food_attendances', 'marked_late')
}
