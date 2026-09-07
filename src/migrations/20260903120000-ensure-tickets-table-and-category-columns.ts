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
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      familyMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      raisedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      departmentId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      jobCategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'ticket_categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      subCategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'ticket_sub_categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      tatOption: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: '1-2 hour',
      },
      customTatDeadline: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      assignedToUserId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      vendorId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      assetId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      approvedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      approvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
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
  } else {
    // Add columns to tickets table if missing
    const ticketColumns = (await queryInterface.describeTable('tickets')) as Record<string, unknown>

    if (!ticketColumns.categoryId) {
      await queryInterface.addColumn('tickets', 'categoryId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'ticket_categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      })
    }

    if (!ticketColumns.subCategoryId) {
      await queryInterface.addColumn('tickets', 'subCategoryId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'ticket_sub_categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      })
    }

    if (!ticketColumns.tatOption) {
      await queryInterface.addColumn('tickets', 'tatOption', {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: '1-2 hour',
      })
    }

    if (!ticketColumns.customTatDeadline) {
      await queryInterface.addColumn('tickets', 'customTatDeadline', {
        type: DataTypes.DATE,
        allowNull: true,
      })
    }

    if (!ticketColumns.approvedByUserId) {
      await queryInterface.addColumn('tickets', 'approvedByUserId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      })
    }

    if (!ticketColumns.approvedAt) {
      await queryInterface.addColumn('tickets', 'approvedAt', {
        type: DataTypes.DATE,
        allowNull: true,
      })
    }
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (tables.includes('tickets')) {
    const ticketColumns = (await queryInterface.describeTable('tickets')) as Record<string, unknown>

    if (ticketColumns.approvedAt) await queryInterface.removeColumn('tickets', 'approvedAt')
    if (ticketColumns.approvedByUserId) await queryInterface.removeColumn('tickets', 'approvedByUserId')
    if (ticketColumns.customTatDeadline) await queryInterface.removeColumn('tickets', 'customTatDeadline')
    if (ticketColumns.tatOption) await queryInterface.removeColumn('tickets', 'tatOption')
    if (ticketColumns.subCategoryId) await queryInterface.removeColumn('tickets', 'subCategoryId')
    if (ticketColumns.categoryId) await queryInterface.removeColumn('tickets', 'categoryId')
  }
}
