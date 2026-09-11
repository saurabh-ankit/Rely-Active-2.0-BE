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

  // Disable foreign key checks to cleanly drop old package_tasks and tasks
  await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0;')

  if (tables.includes('package_tasks')) {
    await queryInterface.dropTable('package_tasks')
  }

  // Drop old tasks table if exists
  if (tables.includes('tasks')) {
    await queryInterface.dropTable('tasks')
  }

  await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1;')

  // Create care_tasks table
  if (!tables.includes('care_tasks')) {
    await queryInterface.createTable('care_tasks', {
      ...commonFields,
      careTaskName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      careTaskDescription: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      dailyRate: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      monthlyRate: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      sessionRate: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      careTaskImage: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
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

    await queryInterface.addIndex('care_tasks', ['propertyId'])
    await queryInterface.addIndex('care_tasks', ['isDeleted'])
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (tables.includes('care_tasks')) {
    await queryInterface.dropTable('care_tasks')
  }
}
