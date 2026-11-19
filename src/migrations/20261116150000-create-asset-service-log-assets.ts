import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes('asset_service_logs')) {
    console.log('asset_service_logs missing, skipping service log assets migration.')
    return
  }

  if (!tables.includes('asset_service_log_assets')) {
    await queryInterface.createTable('asset_service_log_assets', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      assetServiceLogId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'asset_service_logs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      assetId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'assets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })

    await queryInterface.addIndex('asset_service_log_assets', ['assetServiceLogId', 'assetId'], {
      unique: true,
      name: 'asset_service_log_assets_log_asset_unique',
    })
    await queryInterface.addIndex('asset_service_log_assets', ['assetId'], {
      name: 'asset_service_log_assets_asset_id_idx',
    })

    await queryInterface.sequelize.query(`
      INSERT INTO asset_service_log_assets (id, assetServiceLogId, assetId, createdAt, updatedAt)
      SELECT UUID(), id, assetId, createdAt, updatedAt
      FROM asset_service_logs
      WHERE assetId IS NOT NULL
    `)

    console.log('Created asset_service_log_assets and backfilled from asset_service_logs.')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (tables.includes('asset_service_log_assets')) {
    await queryInterface.dropTable('asset_service_log_assets')
  }
}
