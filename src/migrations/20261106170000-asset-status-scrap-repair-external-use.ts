import type { QueryInterface } from 'sequelize'

/**
 * Add 'scrap', 'repair', and 'external_use' to assets.status ENUM.
 * Idempotent: safe if an earlier incremental migration already applied the final ENUM.
 */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes('assets')) {
    console.log('assets table missing, skipping status ENUM migration.')
    return
  }

  const cols = await queryInterface.describeTable('assets')
  const statusType = String((cols.status as { type?: string })?.type || '').toLowerCase()

  const hasScrap = statusType.includes("'scrap'") || statusType.includes('scrap')
  const hasRepair = statusType.includes("'repair'") || /\brepair\b/.test(statusType)
  const hasExternalUse = statusType.includes('external_use')

  if (hasScrap && hasRepair && hasExternalUse) {
    console.log('assets.status ENUM already includes scrap/repair/external_use, skipping.')
    return
  }

  await queryInterface.sequelize.query(`
    ALTER TABLE \`assets\`
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

  console.log("Added 'scrap', 'repair', and 'external_use' to assets.status ENUM.")
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes('assets')) return

  await queryInterface.sequelize.query(`
    UPDATE \`assets\`
    SET \`status\` = 'disposed'
    WHERE \`status\` = 'scrap';
  `)

  await queryInterface.sequelize.query(`
    UPDATE \`assets\`
    SET \`status\` = 'maintenance'
    WHERE \`status\` = 'repair';
  `)

  await queryInterface.sequelize.query(`
    UPDATE \`assets\`
    SET \`status\` = 'available'
    WHERE \`status\` = 'external_use';
  `)

  await queryInterface.sequelize.query(`
    ALTER TABLE \`assets\`
    MODIFY COLUMN \`status\` ENUM(
      'available',
      'assigned',
      'maintenance',
      'retired',
      'disposed'
    ) NOT NULL;
  `)
}
