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

  if (!tables.includes('ticket_categories')) {
    await queryInterface.createTable('ticket_categories', {
      ...commonFields,
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
  }

  if (!tables.includes('ticket_sub_categories')) {
    await queryInterface.createTable('ticket_sub_categories', {
      ...commonFields,
      categoryId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'ticket_categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
  }

  // Add columns to tickets table if not exists
  if (!tables.includes('tickets')) {
    return
  }

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

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.dropTable('ticket_sub_categories')
  await queryInterface.dropTable('ticket_categories')
}
