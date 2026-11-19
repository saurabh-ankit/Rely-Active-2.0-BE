import { DataTypes, type QueryInterface } from 'sequelize'

const PARENT = 'asset_item_requests'
const CHILD = 'asset_item_request_assets'
const UNIQUE_INDEX = 'asset_item_request_assets_request_asset_unique'
const ASSET_INDEX = 'asset_item_request_assets_asset_id_idx'
const REQUEST_FK = 'aira_request_id_fk'
const ASSET_FK = 'aira_asset_id_fk'

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

async function hasIndex(queryInterface: QueryInterface, table: string, indexName: string): Promise<boolean> {
  const indexes = (await queryInterface.showIndex(table)) as Array<{ name: string }>
  return indexes.some((index) => index.name === indexName)
}

async function hasForeignKeyOnColumn(queryInterface: QueryInterface, table: string, column: string): Promise<boolean> {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME AS name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :table
       AND COLUMN_NAME = :column
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    { replacements: { table, column } },
  )
  return Array.isArray(rows) && rows.length > 0
}

async function ensureColumn(
  queryInterface: QueryInterface,
  cols: Record<string, unknown>,
  name: string,
  definition: Record<string, unknown>,
): Promise<void> {
  if (!cols[name]) {
    await queryInterface.addColumn(CHILD, name, definition as unknown as Parameters<QueryInterface['addColumn']>[2])
    console.log(`Added ${CHILD}.${name}`)
  }
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = normalizeTableNames(await queryInterface.showAllTables())

  if (!tables.includes(CHILD)) {
    await queryInterface.createTable(CHILD, {
      ...commonFields,
      assetItemRequestId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      assetId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      outboundStatus: {
        type: DataTypes.ENUM('pending', 'approved', 'declined'),
        allowNull: false,
        defaultValue: 'pending',
      },
      returnStatus: {
        type: DataTypes.ENUM('pending', 'approved', 'declined'),
        allowNull: false,
        defaultValue: 'pending',
      },
      outboundDecidedBy: {
        type: DataTypes.CHAR(36),
        allowNull: true,
      },
      returnDecidedBy: {
        type: DataTypes.CHAR(36),
        allowNull: true,
      },
      outboundDecidedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      returnDecidedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    })
    console.log(`Created ${CHILD} table.`)
  } else {
    const cols = await queryInterface.describeTable(CHILD)
    await ensureColumn(queryInterface, cols, 'outboundStatus', {
      type: DataTypes.ENUM('pending', 'approved', 'declined'),
      allowNull: false,
      defaultValue: 'pending',
    })
    await ensureColumn(queryInterface, cols, 'returnStatus', {
      type: DataTypes.ENUM('pending', 'approved', 'declined'),
      allowNull: false,
      defaultValue: 'pending',
    })
    await ensureColumn(queryInterface, cols, 'outboundDecidedBy', {
      type: DataTypes.CHAR(36),
      allowNull: true,
    })
    await ensureColumn(queryInterface, cols, 'returnDecidedBy', {
      type: DataTypes.CHAR(36),
      allowNull: true,
    })
    await ensureColumn(queryInterface, cols, 'outboundDecidedAt', {
      type: DataTypes.DATE,
      allowNull: true,
    })
    await ensureColumn(queryInterface, cols, 'returnDecidedAt', {
      type: DataTypes.DATE,
      allowNull: true,
    })
  }

  if (!(await hasForeignKeyOnColumn(queryInterface, CHILD, 'assetItemRequestId'))) {
    await queryInterface.addConstraint(CHILD, {
      fields: ['assetItemRequestId'],
      type: 'foreign key',
      name: REQUEST_FK,
      references: { table: PARENT, field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    })
  }

  if (!(await hasForeignKeyOnColumn(queryInterface, CHILD, 'assetId'))) {
    await queryInterface.addConstraint(CHILD, {
      fields: ['assetId'],
      type: 'foreign key',
      name: ASSET_FK,
      references: { table: 'assets', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    })
  }

  if (!(await hasIndex(queryInterface, CHILD, UNIQUE_INDEX))) {
    await queryInterface.addIndex(CHILD, ['assetItemRequestId', 'assetId'], {
      name: UNIQUE_INDEX,
      unique: true,
    })
  }

  if (!(await hasIndex(queryInterface, CHILD, ASSET_INDEX))) {
    await queryInterface.addIndex(CHILD, ['assetId'], {
      name: ASSET_INDEX,
    })
  }

  if (tables.includes(PARENT)) {
    const parentCols = await queryInterface.describeTable(PARENT)
    if (parentCols.assetIds) {
      // Copy JSON ids that still point at a real asset. Stale ids are skipped so the FK can be enforced.
      await queryInterface.sequelize.query(`
        INSERT INTO \`${CHILD}\` (\`id\`, \`assetItemRequestId\`, \`assetId\`, \`createdAt\`, \`updatedAt\`)
        SELECT UUID(), src.requestId, src.assetId, NOW(), NOW()
        FROM (
          SELECT DISTINCT r.\`id\` AS requestId, jt.assetId AS assetId
          FROM \`${PARENT}\` r
          JOIN JSON_TABLE(
            r.\`assetIds\`,
            '$[*]' COLUMNS (assetId CHAR(36) PATH '$')
          ) jt
          JOIN \`assets\` a ON a.\`id\` = jt.assetId
          WHERE r.\`assetIds\` IS NOT NULL
            AND JSON_TYPE(r.\`assetIds\`) = 'ARRAY'
            AND jt.assetId IS NOT NULL
            AND jt.assetId <> ''
        ) src
        WHERE NOT EXISTS (
          SELECT 1
          FROM \`${CHILD}\` existing
          WHERE existing.\`assetItemRequestId\` = src.requestId
            AND existing.\`assetId\` = src.assetId
        )
      `)
      console.log(`Backfilled ${CHILD} from ${PARENT}.assetIds.`)
    }
  }

  // Best-effort backfill for existing decided rows.
  await queryInterface.sequelize.query(`
    UPDATE \`${CHILD}\`
    SET returnDecidedAt = updatedAt
    WHERE returnStatus IN ('approved', 'declined')
      AND returnDecidedAt IS NULL
  `)

  // Prefer status-log timestamps that fall within this gate-pass row's lifetime.
  await queryInterface.sequelize.query(`
    UPDATE \`${CHILD}\` ra
    SET outboundDecidedAt = (
      SELECT MIN(l.createdAt)
      FROM asset_status_logs l
      WHERE l.assetId = ra.assetId
        AND l.note IN (
          'Inter-center transfer outbound approved at gate',
          'Inter-center transfer outbound declined at gate'
        )
        AND l.createdAt >= ra.createdAt
        AND l.createdAt <= COALESCE(ra.returnDecidedAt, ra.updatedAt)
    )
    WHERE ra.outboundStatus IN ('approved', 'declined')
      AND ra.outboundDecidedAt IS NULL
  `)

  await queryInterface.sequelize.query(`
    UPDATE \`${CHILD}\`
    SET outboundDecidedAt = updatedAt
    WHERE outboundStatus IN ('approved', 'declined')
      AND returnStatus = 'pending'
      AND outboundDecidedAt IS NULL
  `)

  await queryInterface.sequelize.query(`
    UPDATE \`${CHILD}\`
    SET outboundDecidedAt = createdAt
    WHERE outboundStatus IN ('approved', 'declined')
      AND outboundDecidedAt IS NULL
  `)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = normalizeTableNames(await queryInterface.showAllTables())

  if (tables.includes(PARENT)) {
    const parentCols = await queryInterface.describeTable(PARENT)
    if (!parentCols.assetIds) {
      await queryInterface.addColumn(PARENT, 'assetIds', {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      })
    }

    if (tables.includes(CHILD)) {
      await queryInterface.sequelize.query(`
        UPDATE \`${PARENT}\` r
        LEFT JOIN (
          SELECT \`assetItemRequestId\`, JSON_ARRAYAGG(\`assetId\`) AS assetIds
          FROM \`${CHILD}\`
          GROUP BY \`assetItemRequestId\`
        ) c ON c.\`assetItemRequestId\` = r.\`id\`
        SET r.\`assetIds\` = COALESCE(c.assetIds, JSON_ARRAY())
      `)
    }
  }

  if (tables.includes(CHILD)) {
    await queryInterface.dropTable(CHILD)
  }
}
