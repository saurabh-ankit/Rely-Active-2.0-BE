import { DataTypes, Sequelize, type QueryInterface } from 'sequelize'

/**
 * One action (e.g. creating and assigning a ticket) can raise several notifications in the
 * same second. With whole-second DATETIME columns those rows tie, so the inbox could list an
 * older notification above a newer one. Millisecond precision keeps them in the order they
 * happened. Existing rows keep their (whole-second) values.
 */
const COLUMNS: Array<[table: string, column: string]> = [
  ['notification_events', 'occurredAt'],
  ['notification_events', 'createdAt'],
  ['notification_inbox', 'createdAt'],
]

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  for (const [table, column] of COLUMNS) {
    await queryInterface.changeColumn(table, column, {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)'),
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  for (const [table, column] of COLUMNS) {
    await queryInterface.changeColumn(table, column, {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    })
  }
}
