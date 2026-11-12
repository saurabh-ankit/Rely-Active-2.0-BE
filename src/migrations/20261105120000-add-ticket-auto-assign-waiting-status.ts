import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Ticket auto-assign: when nobody is on shift as a ticket is raised, it waits a minute and
 * checks again before escalating. That wait is the WAITING status on the attempt (a row with
 * no staff member) and on the ticket.
 */

const ATTEMPTS = 'ticket_auto_assign_attempts'
const TICKETS = 'tickets'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.changeColumn(ATTEMPTS, 'status', {
    type: DataTypes.ENUM('OFFERED', 'WAITING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'OFFERED',
  })
  await queryInterface.changeColumn(TICKETS, 'autoAssignStatus', {
    type: DataTypes.ENUM('WAITING', 'OFFERED', 'ASSIGNED', 'ESCALATED'),
    allowNull: true,
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // A wait that never finished becomes "nothing in progress" / an expired step
  await queryInterface.sequelize.query(
    `UPDATE ${TICKETS} SET autoAssignStatus = NULL WHERE autoAssignStatus = 'WAITING'`,
  )
  await queryInterface.sequelize.query(`UPDATE ${ATTEMPTS} SET status = 'EXPIRED' WHERE status = 'WAITING'`)
  await queryInterface.changeColumn(ATTEMPTS, 'status', {
    type: DataTypes.ENUM('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'OFFERED',
  })
  await queryInterface.changeColumn(TICKETS, 'autoAssignStatus', {
    type: DataTypes.ENUM('OFFERED', 'ASSIGNED', 'ESCALATED'),
    allowNull: true,
  })
}
