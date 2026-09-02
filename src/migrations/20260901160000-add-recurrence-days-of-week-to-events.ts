import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('events')
  if (!tableDescription.recurrenceDaysOfWeek) {
    await queryInterface.addColumn('events', 'recurrenceDaysOfWeek', {
      type: DataTypes.JSON,
      allowNull: true,
    })
  }

  await queryInterface.sequelize.query(`
    UPDATE events
    SET recurrenceDaysOfWeek = JSON_ARRAY(recurrenceDayOfWeek)
    WHERE recurrenceDayOfWeek IS NOT NULL
      AND (recurrenceDaysOfWeek IS NULL OR JSON_LENGTH(recurrenceDaysOfWeek) = 0)
  `)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('events')
  if (tableDescription.recurrenceDaysOfWeek) {
    await queryInterface.removeColumn('events', 'recurrenceDaysOfWeek')
  }
}
