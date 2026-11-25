import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * An admin can close an Open / In Progress ticket that was raised by mistake. It is saved
 * as CANCELLED (shown as "Closed" in the UI) with the reason and who closed it.
 */

const TICKETS = 'tickets'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.addColumn(TICKETS, 'closeReason', { type: DataTypes.TEXT, allowNull: true })
  await queryInterface.addColumn(TICKETS, 'closedByUserId', { type: DataTypes.UUID, allowNull: true })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.removeColumn(TICKETS, 'closedByUserId')
  await queryInterface.removeColumn(TICKETS, 'closeReason')
}
