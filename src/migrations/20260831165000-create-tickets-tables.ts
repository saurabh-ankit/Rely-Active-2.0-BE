import { DataTypes, type QueryInterface } from 'sequelize'

const commonFields = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
  updatedBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
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

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes('tickets')) {
    await queryInterface.createTable('tickets', {
      ...commonFields,
      ticketNumber: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: 'REPAIR_MAINTENANCE',
      },
      priority: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'MEDIUM',
      },
      status: {
        type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'OPEN',
      },
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'property_units', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      familyMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'resident_family_members', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      raisedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      departmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      jobCategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'job_categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      assignedToUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      vendorId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'asset_vendors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      assetId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'assets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      dueDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      closedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resolutionNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      attachments: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    })
  }

  if (!tables.includes('ticket_activity_logs')) {
    await queryInterface.createTable('ticket_activity_logs', {
      ...commonFields,
      ticketId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'tickets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      performedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      performedByName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      activityType: {
        type: DataTypes.ENUM(
          'CREATED',
          'APPROVED',
          'ASSIGNED',
          'STATUS_CHANGE',
          'COMMENT_ADDED',
          'ATTACHMENT_ADDED',
          'PRIORITY_CHANGE',
          'UPDATED',
        ),
        allowNull: false,
      },
      fromStatus: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      toStatus: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      attachments: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.dropTable('ticket_activity_logs')
  await queryInterface.dropTable('tickets')
}
