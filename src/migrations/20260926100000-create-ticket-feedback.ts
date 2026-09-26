import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Resident feedback on a completed ticket: a rating and a comment, left once
 * the work is done. One row per ticket — re-submitting updates it — and the
 * family member who left it is recorded when it was not the resident.
 */

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (tableNames.includes('ticket_feedbacks')) return

  await queryInterface.createTable('ticket_feedbacks', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    createdBy: { type: DataTypes.CHAR(36), allowNull: true },
    updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
    ticketId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tickets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'residents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    // Null when the resident themselves left the feedback.
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'resident_family_members', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    rating: {
      type: DataTypes.ENUM('GOOD', 'AVERAGE', 'POOR'),
      allowNull: false,
    },
    comment: { type: DataTypes.TEXT, allowNull: true },
    attachments: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  })

  // One feedback per ticket; a re-submit updates the existing row.
  await queryInterface.addIndex('ticket_feedbacks', ['ticketId'], {
    unique: true,
    name: 'ticket_feedbacks_ticketId_unique',
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (!tableNames.includes('ticket_feedbacks')) return

  await queryInterface.dropTable('ticket_feedbacks')
}
