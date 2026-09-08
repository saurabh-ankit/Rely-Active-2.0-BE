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

  if (!tables.includes('packages')) {
    await queryInterface.createTable('packages', {
      ...commonFields,
      packageName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      packageCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      duration: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Monthly',
        comment: 'Monthly or Yearly',
      },
      tasks: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: 'List of task items with taskId and complimentaryCount (1, 2, 3, 4, 5, 6...)',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'properties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })

    // Indexes for querying
    await queryInterface.addIndex('packages', ['propertyId'])
    await queryInterface.addIndex('packages', ['duration'])
    await queryInterface.addIndex('packages', ['isDeleted'])
  } else {
    const tableInfo = await queryInterface.describeTable('packages')
    if (!tableInfo.tasks) {
      await queryInterface.addColumn('packages', 'tasks', {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      })
    }
    if (tableInfo.packageDescription && !tableInfo.description) {
      await queryInterface.renameColumn('packages', 'packageDescription', 'description')
    } else if (!tableInfo.description) {
      await queryInterface.addColumn('packages', 'description', {
        type: DataTypes.TEXT,
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

  if (tables.includes('packages')) {
    await queryInterface.dropTable('packages')
  }
}
