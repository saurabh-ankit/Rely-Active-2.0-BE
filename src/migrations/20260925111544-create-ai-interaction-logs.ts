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

  if (tables.includes('ai_interaction_logs')) {
    await queryInterface.dropTable('ai_interaction_logs')
  }

  await queryInterface.createTable('ai_interaction_logs', {
    ...commonFields,
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'residents',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'resident_family_members',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    model: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'SUCCESS',
    },
    tokens: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  })

  await queryInterface.addIndex('ai_interaction_logs', ['residentId'])
  await queryInterface.addIndex('ai_interaction_logs', ['familyMemberId'])
  await queryInterface.addIndex('ai_interaction_logs', ['status'])
  await queryInterface.addIndex('ai_interaction_logs', ['createdAt'])
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (tables.includes('ai_interaction_logs')) {
    await queryInterface.dropTable('ai_interaction_logs')
  }
}
