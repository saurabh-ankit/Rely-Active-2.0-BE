import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Sub-module permissions (rely-assist pattern): sub-modules are rows in `resources`
 * with dotted keys (e.g. `FNB.ORDERS`), and grants stay in `user_location_permissions`.
 *
 * - sortOrder: display order in the access matrix and sidebar.
 * - grantsAppliedAt: when a resource's starting grants were applied. The catalogue
 *   sync (services/resourceCatalog.service.ts) applies a new sub-module's inherited
 *   grants once and stamps this, so access an admin later removes is never re-added.
 *
 * Existing modules are stamped now: their grants were already set by hand.
 * The rows themselves are created by the catalogue sync at server start.
 */
const TABLE = 'resources'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const columns = await queryInterface.describeTable(TABLE)
  if (!columns.sortOrder) {
    await queryInterface.addColumn(TABLE, 'sortOrder', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 })
  }
  if (!columns.grantsAppliedAt) {
    await queryInterface.addColumn(TABLE, 'grantsAppliedAt', { type: DataTypes.DATE, allowNull: true })
  }
  await queryInterface.sequelize.query(
    `UPDATE resources SET grantsAppliedAt = NOW() WHERE grantsAppliedAt IS NULL AND \`key\` NOT LIKE '%.%'`,
  )
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const columns = await queryInterface.describeTable(TABLE)
  if (columns.grantsAppliedAt) await queryInterface.removeColumn(TABLE, 'grantsAppliedAt')
  if (columns.sortOrder) await queryInterface.removeColumn(TABLE, 'sortOrder')
}
