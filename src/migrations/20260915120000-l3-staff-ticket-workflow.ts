import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * L3 staff ticket workflow (Repair & Maintenance, Concierge):
 * - work start / completion audit columns and invoice amount on `tickets`
 * - `ticket_tat_histories` audit trail for every TAT change
 */

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (tableNames.includes('tickets')) {
    const ticketColumns = await queryInterface.describeTable('tickets')

    if (!ticketColumns.workStartedAt) {
      await queryInterface.addColumn('tickets', 'workStartedAt', { type: DataTypes.DATE, allowNull: true })
    }
    if (!ticketColumns.workStartedByUserId) {
      await queryInterface.addColumn('tickets', 'workStartedByUserId', { type: DataTypes.UUID, allowNull: true })
    }
    if (!ticketColumns.completedAt) {
      await queryInterface.addColumn('tickets', 'completedAt', { type: DataTypes.DATE, allowNull: true })
    }
    if (!ticketColumns.completedByUserId) {
      await queryInterface.addColumn('tickets', 'completedByUserId', { type: DataTypes.UUID, allowNull: true })
    }
    if (!ticketColumns.invoiceAmount) {
      await queryInterface.addColumn('tickets', 'invoiceAmount', { type: DataTypes.DECIMAL(12, 2), allowNull: true })
    }
  }

  if (!tableNames.includes('ticket_tat_histories')) {
    await queryInterface.createTable('ticket_tat_histories', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      ticketId: { type: DataTypes.UUID, allowNull: false },
      previousTatOption: { type: DataTypes.STRING(64), allowNull: true },
      previousTatDeadline: { type: DataTypes.DATE, allowNull: true },
      updatedTatOption: { type: DataTypes.STRING(64), allowNull: true },
      updatedTatDeadline: { type: DataTypes.DATE, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: false },
      changedByUserId: { type: DataTypes.UUID, allowNull: false },
      changedByName: { type: DataTypes.STRING(255), allowNull: true },
      changedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })
    await queryInterface.addIndex('ticket_tat_histories', ['ticketId'])
    await queryInterface.addIndex('ticket_tat_histories', ['changedByUserId'])
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (tableNames.includes('ticket_tat_histories')) {
    await queryInterface.dropTable('ticket_tat_histories')
  }

  if (tableNames.includes('tickets')) {
    const ticketColumns = await queryInterface.describeTable('tickets')
    for (const column of [
      'invoiceAmount',
      'completedByUserId',
      'completedAt',
      'workStartedByUserId',
      'workStartedAt',
    ]) {
      if (ticketColumns[column]) await queryInterface.removeColumn('tickets', column)
    }
  }
}
