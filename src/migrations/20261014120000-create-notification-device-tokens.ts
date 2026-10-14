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
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes('notification_device_tokens')) {
    return
  }

  await queryInterface.createTable('notification_device_tokens', {
    ...idColumn,
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
    appSurface: {
      type: DataTypes.ENUM('WEB_APP', 'MOBILE_L1', 'MOBILE_L3'),
      allowNull: false,
    },
    platform: {
      type: DataTypes.ENUM('WEB', 'ANDROID', 'IOS'),
      allowNull: false,
      defaultValue: 'WEB',
    },
    deviceId: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    fcmToken: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    appVersion: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastRegisteredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    invalidatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    invalidationReason: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    ...auditColumns,
  })

  await queryInterface.addIndex('notification_device_tokens', ['fcmToken'], {
    unique: true,
    name: 'notification_device_tokens_fcm_token_unique',
  })
  await queryInterface.addIndex('notification_device_tokens', ['recipientUserId', 'isActive'], {
    name: 'notification_device_tokens_user_active_idx',
  })
  await queryInterface.addIndex('notification_device_tokens', ['recipientResidentId', 'isActive'], {
    name: 'notification_device_tokens_resident_active_idx',
  })
  await queryInterface.addIndex('notification_device_tokens', ['recipientFamilyMemberId', 'isActive'], {
    name: 'notification_device_tokens_family_active_idx',
  })
  await queryInterface.addIndex('notification_device_tokens', ['appSurface', 'platform', 'deviceId', 'isActive'], {
    name: 'notification_device_tokens_device_active_idx',
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes('notification_device_tokens')) {
    await queryInterface.dropTable('notification_device_tokens')
  }
}
