import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Ticket auto-assign (docs/ticket-auto-assign.md):
 * - ticket_auto_assign_settings: the toggle per property + department, and the response time.
 * - ticket_auto_assign_attempts: each offer to a staff member (the log shown on the dashboard).
 * - tickets.autoAssignStatus / tickets.offeredToUserId: where auto-assign stands for a ticket.
 */

const SETTINGS = 'ticket_auto_assign_settings'
const ATTEMPTS = 'ticket_auto_assign_attempts'
const TICKETS = 'tickets'

const auditColumns = {
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await getTableNames(queryInterface)

  if (!tables.includes(SETTINGS)) {
    await queryInterface.createTable(SETTINGS, {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      departmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      responseTimeoutMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
      ...auditColumns,
    })
    await queryInterface.addIndex(SETTINGS, ['locationId', 'departmentId'], {
      unique: true,
      name: 'uq_ticket_auto_assign_settings_location_department',
    })
  }

  if (!tables.includes(ATTEMPTS)) {
    await queryInterface.createTable(ATTEMPTS, {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ticketId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'tickets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      attemptNumber: { type: DataTypes.INTEGER, allowNull: false },
      tatLoadMinutes: { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.ENUM('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'OFFERED',
      },
      reason: { type: DataTypes.TEXT, allowNull: true },
      tatOption: { type: DataTypes.STRING(64), allowNull: true },
      customTatDeadline: { type: DataTypes.DATE, allowNull: true },
      offeredAt: { type: DataTypes.DATE, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      respondedAt: { type: DataTypes.DATE, allowNull: true },
      ...auditColumns,
    })
    await queryInterface.addIndex(ATTEMPTS, ['ticketId'], { name: 'idx_ticket_auto_assign_attempts_ticket' })
    await queryInterface.addIndex(ATTEMPTS, ['status', 'expiresAt'], {
      name: 'idx_ticket_auto_assign_attempts_status_expires',
    })
    await queryInterface.addIndex(ATTEMPTS, ['userId', 'status'], { name: 'idx_ticket_auto_assign_attempts_user' })
  }

  const ticketColumns = await queryInterface.describeTable(TICKETS)
  if (!ticketColumns.autoAssignStatus) {
    await queryInterface.addColumn(TICKETS, 'autoAssignStatus', {
      type: DataTypes.ENUM('OFFERED', 'ASSIGNED', 'ESCALATED'),
      allowNull: true,
    })
  }
  if (!ticketColumns.offeredToUserId) {
    await queryInterface.addColumn(TICKETS, 'offeredToUserId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
    await queryInterface.addIndex(TICKETS, ['offeredToUserId'], { name: 'idx_tickets_offered_to_user' })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const ticketColumns = await queryInterface.describeTable(TICKETS)
  if (ticketColumns.offeredToUserId) {
    await queryInterface.removeIndex(TICKETS, 'idx_tickets_offered_to_user').catch(() => undefined)
    await queryInterface.removeColumn(TICKETS, 'offeredToUserId')
  }
  if (ticketColumns.autoAssignStatus) await queryInterface.removeColumn(TICKETS, 'autoAssignStatus')

  const tables = await getTableNames(queryInterface)
  if (tables.includes(ATTEMPTS)) await queryInterface.dropTable(ATTEMPTS)
  if (tables.includes(SETTINGS)) await queryInterface.dropTable(SETTINGS)
}
