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

function normalizeTableNames(rawTables: Awaited<ReturnType<QueryInterface['showAllTables']>>): string[] {
  return rawTables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

/**
 * Create asset_item_requests at the final schema, or upgrade a partial/legacy table
 * left behind by earlier incremental migrations on a local/dev DB.
 */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = normalizeTableNames(await queryInterface.showAllTables())

  if (!tables.includes('asset_item_requests')) {
    await queryInterface.createTable('asset_item_requests', {
      ...commonFields,
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      assetIds: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      reason: {
        type: DataTypes.ENUM('scrap', 'repair', 'external_use'),
        allowNull: false,
      },
      problem: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      qrCode: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      qrCodeImage: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'declined'),
        allowNull: false,
        defaultValue: 'pending',
      },
      requestImage: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
      },
      declineComment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      declineImage: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
      },
      expectedReturnDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    })

    console.log('Created asset_item_requests table.')
    return
  }

  const cols = await queryInterface.describeTable('asset_item_requests')

  // Legacy create used itemIds; rename (or add) to assetIds and clear stale catalog UUIDs.
  if (cols.itemIds && !cols.assetIds) {
    await queryInterface.renameColumn('asset_item_requests', 'itemIds', 'assetIds')
    await queryInterface.sequelize.query(`UPDATE asset_item_requests SET assetIds = CAST('[]' AS JSON)`)
  } else if (!cols.assetIds) {
    await queryInterface.addColumn('asset_item_requests', 'assetIds', {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    })
  }

  const statusType = String((cols.status as { type?: string })?.type || '').toLowerCase()
  const needsStatusMigrate =
    Boolean(cols.status) && (statusType.includes('processed') || !statusType.includes('approved'))

  if (needsStatusMigrate) {
    await queryInterface.changeColumn('asset_item_requests', 'status', {
      type: DataTypes.ENUM('pending', 'processed', 'approved', 'declined'),
      allowNull: false,
      defaultValue: 'pending',
    })

    await queryInterface.sequelize.query(
      `UPDATE asset_item_requests SET status = 'approved' WHERE status = 'processed'`,
    )

    await queryInterface.changeColumn('asset_item_requests', 'status', {
      type: DataTypes.ENUM('pending', 'approved', 'declined'),
      allowNull: false,
      defaultValue: 'pending',
    })
  }

  if (!cols.requestImage) {
    await queryInterface.addColumn('asset_item_requests', 'requestImage', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  }

  if (!cols.declineComment) {
    await queryInterface.addColumn('asset_item_requests', 'declineComment', {
      type: DataTypes.TEXT,
      allowNull: true,
    })
  }

  if (!cols.declineImage) {
    await queryInterface.addColumn('asset_item_requests', 'declineImage', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  }

  if (!cols.expectedReturnDate) {
    await queryInterface.addColumn('asset_item_requests', 'expectedReturnDate', {
      type: DataTypes.DATE,
      allowNull: true,
    })
  }

  console.log('Ensured asset_item_requests matches final schema.')
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = normalizeTableNames(await queryInterface.showAllTables())
  if (tables.includes('asset_item_requests')) {
    await queryInterface.dropTable('asset_item_requests')
  }
}
