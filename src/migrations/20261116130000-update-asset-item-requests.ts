import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'asset_item_requests'

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

  if (cols.assetIds) {
    await queryInterface.removeColumn(TABLE, 'assetIds')
    console.log(`Removed ${TABLE}.assetIds.`)
  }

  const statusType = String((cols.status as { type?: string })?.type || '').toLowerCase()
  if (!statusType.includes('cancelled') || !statusType.includes('returned')) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`${TABLE}\`
      MODIFY COLUMN \`status\` ENUM(
        'pending',
        'approved',
        'declined',
        'returned',
        'return_declined',
        'cancelled'
      ) NOT NULL DEFAULT 'pending';
    `)
    console.log(`Updated ${TABLE}.status ENUM to final values.`)
  }

  if (!cols.returnDeclineComment) {
    await queryInterface.addColumn(TABLE, 'returnDeclineComment', {
      type: DataTypes.TEXT,
      allowNull: true,
    })
  }
  if (!cols.returnDeclineImage) {
    await queryInterface.addColumn(TABLE, 'returnDeclineImage', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  }

  const reasonType = String((cols.reason as { type?: string })?.type || '').toLowerCase()
  if (!reasonType.includes('inter_center_transfer')) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`${TABLE}\`
      MODIFY COLUMN \`reason\` ENUM(
        'scrap',
        'repair',
        'external_use',
        'inter_center_transfer'
      ) NOT NULL;
    `)
    console.log(`Updated ${TABLE}.reason ENUM to include inter_center_transfer.`)
  }

  if (!cols.toLocId) {
    await queryInterface.addColumn(TABLE, 'toLocId', {
      type: DataTypes.UUID,
      allowNull: true,
    })
  }
  if (!cols.transferSendCondition) {
    await queryInterface.addColumn(TABLE, 'transferSendCondition', {
      type: DataTypes.ENUM('new', 'good', 'bad', 'partially_damage'),
      allowNull: true,
    })
  }
  if (!cols.transferReceiveCondition) {
    await queryInterface.addColumn(TABLE, 'transferReceiveCondition', {
      type: DataTypes.ENUM('new', 'good', 'bad', 'partially_damage'),
      allowNull: true,
    })
  }
  if (!cols.transferReceiveDescription) {
    await queryInterface.addColumn(TABLE, 'transferReceiveDescription', {
      type: DataTypes.TEXT,
      allowNull: true,
    })
  }
  if (!cols.transferReceiveImage) {
    await queryInterface.addColumn(TABLE, 'transferReceiveImage', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  }
  if (!cols.transferRejectDescription) {
    await queryInterface.addColumn(TABLE, 'transferRejectDescription', {
      type: DataTypes.TEXT,
      allowNull: true,
    })
  }
  if (!cols.transferRejectImage) {
    await queryInterface.addColumn(TABLE, 'transferRejectImage', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = normalizeTableNames(await queryInterface.showAllTables())

  if (!tables.includes(TABLE)) return

  const cols = await queryInterface.describeTable(TABLE)

  const removeIfExists = async (col: string) => {
    if (cols[col]) await queryInterface.removeColumn(TABLE, col)
  }

  await removeIfExists('transferRejectImage')
  await removeIfExists('transferRejectDescription')
  await removeIfExists('transferReceiveImage')
  await removeIfExists('transferReceiveDescription')
  await removeIfExists('transferReceiveCondition')
  await removeIfExists('transferSendCondition')
  await removeIfExists('toLocId')

  await queryInterface.sequelize.query(`
    DELETE FROM \`${TABLE}\` WHERE \`reason\` = 'inter_center_transfer';
  `)
  await queryInterface.sequelize.query(`
    ALTER TABLE \`${TABLE}\`
    MODIFY COLUMN \`reason\` ENUM('scrap', 'repair', 'external_use') NOT NULL;
  `)

  if (cols.returnDeclineComment) {
    await queryInterface.removeColumn(TABLE, 'returnDeclineComment')
  }
  if (cols.returnDeclineImage) {
    await queryInterface.removeColumn(TABLE, 'returnDeclineImage')
  }

  await queryInterface.sequelize.query(`
    UPDATE \`${TABLE}\`
    SET \`status\` = 'declined'
    WHERE \`status\` = 'cancelled';
  `)
  await queryInterface.sequelize.query(`
    UPDATE \`${TABLE}\`
    SET \`status\` = 'approved'
    WHERE \`status\` IN ('returned', 'return_declined');
  `)
  await queryInterface.sequelize.query(`
    ALTER TABLE \`${TABLE}\`
    MODIFY COLUMN \`status\` ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending';
  `)
}
