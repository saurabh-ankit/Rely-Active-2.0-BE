import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (!tableNames.includes('shift_resident_pools')) return

  const cols = await queryInterface.describeTable('shift_resident_pools')

  if (cols.residentId) {
    // Existing resident-keyed rows cannot map cleanly; clear before swap.
    await queryInterface.sequelize.query('DELETE FROM shift_resident_pools')

    const [constraints] = (await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'shift_resident_pools'
        AND COLUMN_NAME = 'residentId'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `)) as [Array<{ CONSTRAINT_NAME: string; COLUMN_NAME: string }>, unknown]

    for (const constraint of constraints) {
      await queryInterface.removeConstraint('shift_resident_pools', constraint.CONSTRAINT_NAME)
    }

    try {
      await queryInterface.removeIndex('shift_resident_pools', ['residentId'])
    } catch {
      // Index may already be gone with the FK constraint
    }

    await queryInterface.removeColumn('shift_resident_pools', 'residentId')
  }

  const colsAfter = await queryInterface.describeTable('shift_resident_pools')
  if (!colsAfter.unitId) {
    await queryInterface.addColumn('shift_resident_pools', 'unitId', {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'property_units', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    })
    await queryInterface.addIndex('shift_resident_pools', ['unitId'])
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (!tableNames.includes('shift_resident_pools')) return

  const cols = await queryInterface.describeTable('shift_resident_pools')

  if (cols.unitId) {
    await queryInterface.sequelize.query('DELETE FROM shift_resident_pools')

    const [constraints] = (await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'shift_resident_pools'
        AND COLUMN_NAME = 'unitId'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `)) as [Array<{ CONSTRAINT_NAME: string; COLUMN_NAME: string }>, unknown]

    for (const constraint of constraints) {
      await queryInterface.removeConstraint('shift_resident_pools', constraint.CONSTRAINT_NAME)
    }

    try {
      await queryInterface.removeIndex('shift_resident_pools', ['unitId'])
    } catch {
      // Index may already be gone with the FK constraint
    }

    await queryInterface.removeColumn('shift_resident_pools', 'unitId')
  }

  const colsAfter = await queryInterface.describeTable('shift_resident_pools')
  if (!colsAfter.residentId) {
    await queryInterface.addColumn('shift_resident_pools', 'residentId', {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'residents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    })
    await queryInterface.addIndex('shift_resident_pools', ['residentId'])
  }
}
