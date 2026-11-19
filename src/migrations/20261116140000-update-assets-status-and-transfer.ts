import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'assets'

function normalizeTableNames(rawTables: Awaited<ReturnType<QueryInterface['showAllTables']>>): string[] {
  return rawTables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = normalizeTableNames(await queryInterface.showAllTables())

  if (!tables.includes(TABLE)) {
    console.log(`${TABLE} missing, skipping update.`)
    return
  }

  const cols = await queryInterface.describeTable(TABLE)
  const statusType = String((cols.status as { type?: string })?.type || '').toLowerCase()

  if (!statusType.includes('inter_center_outbound_pending') || !statusType.includes('pending_inspection')) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`${TABLE}\`
      MODIFY COLUMN \`status\` ENUM(
        'available',
        'assigned',
        'maintenance',
        'retired',
        'disposed',
        'scrap',
        'repair',
        'external_use',
        'pending_inspection',
        'inter_center_outbound_pending',
        'inter_center_incoming',
        'pending_transfer_acceptance',
        'transfer_rejected'
      ) NOT NULL;
    `)
    console.log(`Updated ${TABLE}.status ENUM to final values.`)
  }

  if (!cols.transferOriginLocationId) {
    await queryInterface.addColumn(TABLE, 'transferOriginLocationId', {
      type: DataTypes.UUID,
      allowNull: true,
    })
    console.log(`Added ${TABLE}.transferOriginLocationId`)
  }

  // Keep origin center on assets after inter-center transfer acceptance (origin registry).
  await queryInterface.sequelize.query(`
    UPDATE assets a
    INNER JOIN asset_item_request_assets ra ON ra.assetId = a.id
    INNER JOIN asset_item_requests r ON r.id = ra.assetItemRequestId
    SET a.transferOriginLocationId = r.locId
    WHERE r.reason = 'inter_center_transfer'
      AND r.status = 'returned'
      AND r.toLocId IS NOT NULL
      AND a.locationId = r.toLocId
      AND a.transferOriginLocationId IS NULL
  `)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = normalizeTableNames(await queryInterface.showAllTables())

  if (!tables.includes(TABLE)) return

  await queryInterface.sequelize.query(`
    UPDATE \`${TABLE}\`
    SET \`status\` = 'external_use'
    WHERE \`status\` = 'pending_inspection';
  `)
  await queryInterface.sequelize.query(`
    UPDATE \`${TABLE}\`
    SET \`status\` = 'maintenance'
    WHERE \`status\` IN (
      'inter_center_outbound_pending',
      'inter_center_incoming',
      'pending_transfer_acceptance',
      'transfer_rejected'
    );
  `)
  await queryInterface.sequelize.query(`
    ALTER TABLE \`${TABLE}\`
    MODIFY COLUMN \`status\` ENUM(
      'available',
      'assigned',
      'maintenance',
      'retired',
      'disposed',
      'scrap',
      'repair',
      'external_use'
    ) NOT NULL;
  `)

  const cols = await queryInterface.describeTable(TABLE)
  if (cols.transferOriginLocationId) {
    await queryInterface.removeColumn(TABLE, 'transferOriginLocationId')
  }
}
