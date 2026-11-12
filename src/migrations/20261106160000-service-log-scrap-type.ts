import type { QueryInterface } from 'sequelize'

/**
 * Add 'scrap' to asset_service_logs.serviceType ENUM.
 */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes('asset_service_logs')) {
    console.log('asset_service_logs table missing, skipping scrap serviceType migration.')
    return
  }

  await queryInterface.sequelize.query(`
    ALTER TABLE \`asset_service_logs\`
    MODIFY COLUMN \`serviceType\` ENUM(
      'repair',
      'preventive',
      'inspection',
      'cleaning',
      'upgrade',
      'scrap'
    ) NOT NULL;
  `)

  console.log("Added 'scrap' to asset_service_logs.serviceType ENUM.")
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes('asset_service_logs')) return

  await queryInterface.sequelize.query(`
    UPDATE \`asset_service_logs\`
    SET \`serviceType\` = 'repair'
    WHERE \`serviceType\` = 'scrap';
  `)

  await queryInterface.sequelize.query(`
    ALTER TABLE \`asset_service_logs\`
    MODIFY COLUMN \`serviceType\` ENUM(
      'repair',
      'preventive',
      'inspection',
      'cleaning',
      'upgrade'
    ) NOT NULL;
  `)
}
