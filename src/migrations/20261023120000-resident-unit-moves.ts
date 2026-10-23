import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * A resident moving from one flat to another in the same property.
 * - resident_unit_moves: one row per move; billing uses it to carry the old flat's unbilled
 *   charges to the new flat and label them "From old flat …".
 * - services_invoice.fromUnitId: the old flat a carried invoice line was used in.
 * - fnb_resident_orders.unitId: the flat an order is delivered to, fixed when it is placed
 *   (it used to be read from the resident's current flat, which changes on a move).
 */

const TABLE = 'resident_unit_moves'

const auditColumns = {
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes(TABLE)) {
    await queryInterface.createTable(TABLE, {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      fromUnitId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> property_units.id (old flat)' },
      toUnitId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> property_units.id (new flat)' },
      moveDate: { type: DataTypes.DATEONLY, allowNull: false, comment: 'First day in the new flat' },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...auditColumns,
    })
    await queryInterface.addIndex(TABLE, ['residentId'], { name: 'idx_resident_unit_moves_resident' })
    await queryInterface.addIndex(TABLE, ['fromUnitId'], { name: 'idx_resident_unit_moves_from' })
    await queryInterface.addIndex(TABLE, ['toUnitId'], { name: 'idx_resident_unit_moves_to' })
    console.log('✅ Created table resident_unit_moves')
  }

  const lineCols = await queryInterface.describeTable('services_invoice')
  if (!lineCols.fromUnitId) {
    await queryInterface.addColumn('services_invoice', 'fromUnitId', {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Old flat this line was used in (carried over after a move)',
    })
    console.log('✅ Added column fromUnitId to services_invoice')
  }

  const orderCols = await queryInterface.describeTable('fnb_resident_orders')
  if (!orderCols.unitId) {
    await queryInterface.addColumn('fnb_resident_orders', 'unitId', {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Flat the order is delivered to (set when placed)',
    })
    await queryInterface.sequelize.query(`
      UPDATE fnb_resident_orders o
      LEFT JOIN residents r ON r.id = o.residentId
      LEFT JOIN resident_family_members f ON f.id = o.familyMemberId
      LEFT JOIN residents rf ON rf.id = f.residentId
      SET o.unitId = COALESCE(r.unitId, rf.unitId)
      WHERE o.unitId IS NULL
    `)
    console.log('✅ Added column unitId to fnb_resident_orders')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const orderCols = await queryInterface.describeTable('fnb_resident_orders')
  if (orderCols.unitId) await queryInterface.removeColumn('fnb_resident_orders', 'unitId')
  const lineCols = await queryInterface.describeTable('services_invoice')
  if (lineCols.fromUnitId) await queryInterface.removeColumn('services_invoice', 'fromUnitId')
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) await queryInterface.dropTable(TABLE)
}
