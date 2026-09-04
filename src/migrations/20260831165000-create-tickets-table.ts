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
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (tables.includes('tickets')) {
    await queryInterface.dropTable('tickets')
  }
}
