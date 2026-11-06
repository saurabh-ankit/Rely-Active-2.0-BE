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

  if (tables.includes('asset_status_logs')) {
    console.log('asset_status_logs table already exists, skipping creation.')
    return
  }

  await queryInterface.createTable('asset_status_logs', {
    ...commonFields,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    fromStatus: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    toStatus: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  })

  await queryInterface.addIndex('asset_status_logs', ['assetId'], {
    name: 'asset_status_logs_asset_id_idx',
  })

  console.log('Created asset_status_logs table.')
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (tables.includes('asset_status_logs')) {
    await queryInterface.dropTable('asset_status_logs')
  }
}
