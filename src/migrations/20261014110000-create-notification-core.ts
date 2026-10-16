import { DataTypes, type QueryInterface } from 'sequelize'

const idColumn = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
}

const auditColumns = {
  createdBy: { type: DataTypes.UUID, allowNull: true },
  updatedBy: { type: DataTypes.UUID, allowNull: true },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (!tableNames.includes('notification_events')) {
    await queryInterface.createTable('notification_events', {
      ...idColumn,
      module: { type: DataTypes.STRING(64), allowNull: false },
      eventCode: { type: DataTypes.STRING(128), allowNull: false },
      entityType: { type: DataTypes.STRING(64), allowNull: false },
      entityId: { type: DataTypes.STRING(128), allowNull: false },
      entityLabel: { type: DataTypes.STRING(255), allowNull: true },
      companyId: { type: DataTypes.UUID, allowNull: true },
      locationId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      actorType: {
        type: DataTypes.ENUM('USER', 'RESIDENT', 'FAMILY_MEMBER', 'SYSTEM'),
        allowNull: true,
      },
      actorUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      actorResidentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      actorFamilyMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'resident_family_members', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      actorName: { type: DataTypes.STRING(255), allowNull: true },
      title: { type: DataTypes.STRING(255), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      actionType: {
        type: DataTypes.ENUM('OPEN_ENTITY', 'OPEN_URL', 'NONE'),
        allowNull: false,
        defaultValue: 'OPEN_ENTITY',
      },
      actionValue: { type: DataTypes.STRING(500), allowNull: true },
      severity: { type: DataTypes.ENUM('INFO', 'WARNING', 'CRITICAL'), allowNull: false, defaultValue: 'INFO' },
      payload: { type: DataTypes.JSON, allowNull: true },
      dedupeKey: { type: DataTypes.STRING(191), allowNull: true },
      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      ...auditColumns,
    })

    await queryInterface.addIndex('notification_events', ['module', 'eventCode', 'occurredAt'], {
      name: 'notification_events_module_event_idx',
    })
    await queryInterface.addIndex('notification_events', ['entityType', 'entityId', 'occurredAt'], {
      name: 'notification_events_entity_idx',
    })
    await queryInterface.addIndex('notification_events', ['locationId', 'occurredAt'], {
      name: 'notification_events_location_idx',
    })
    await queryInterface.addIndex('notification_events', ['dedupeKey'], {
      unique: true,
      name: 'notification_events_dedupe_unique',
    })
  }

  if (!tableNames.includes('notification_inbox')) {
    await queryInterface.createTable('notification_inbox', {
      ...idColumn,
      eventId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'notification_events', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      recipientType: {
        type: DataTypes.ENUM('USER', 'RESIDENT', 'FAMILY_MEMBER'),
        allowNull: false,
      },
      recipientUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      recipientResidentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      recipientFamilyMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'resident_family_members', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      channel: { type: DataTypes.ENUM('IN_APP'), allowNull: false, defaultValue: 'IN_APP' },
      status: { type: DataTypes.ENUM('UNREAD', 'READ', 'ARCHIVED'), allowNull: false, defaultValue: 'UNREAD' },
      deliveredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      readAt: { type: DataTypes.DATE, allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true },
      ...auditColumns,
    })

    await queryInterface.addIndex('notification_inbox', ['eventId'], {
      name: 'notification_inbox_event_idx',
    })
    await queryInterface.addIndex('notification_inbox', ['recipientUserId', 'status', 'createdAt'], {
      name: 'notification_inbox_user_status_idx',
    })
    await queryInterface.addIndex('notification_inbox', ['recipientResidentId', 'status', 'createdAt'], {
      name: 'notification_inbox_resident_status_idx',
    })
    await queryInterface.addIndex('notification_inbox', ['recipientFamilyMemberId', 'status', 'createdAt'], {
      name: 'notification_inbox_family_status_idx',
    })
    await queryInterface.addIndex(
      'notification_inbox',
      ['eventId', 'recipientUserId', 'recipientResidentId', 'recipientFamilyMemberId'],
      {
        name: 'notification_inbox_event_recipient_idx',
      },
    )
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes('notification_inbox')) {
    await queryInterface.dropTable('notification_inbox')
  }
  if (tableNames.includes('notification_events')) {
    await queryInterface.dropTable('notification_events')
  }
}
