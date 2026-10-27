import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'shift_assignments'
const COLUMN = 'amenityId'
const INDEX_NAME = 'shift_assignments_amenity_id'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const cols = await queryInterface.describeTable(TABLE)

  if (!cols[COLUMN]) {
    await queryInterface.addColumn(TABLE, COLUMN, {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'amenities', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
  }

  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name: string }>
  if (!indexes.some((index) => index.name === INDEX_NAME)) {
    await queryInterface.addIndex(TABLE, [COLUMN], { name: INDEX_NAME })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name: string }>
  if (indexes.some((index) => index.name === INDEX_NAME)) {
    await queryInterface.removeIndex(TABLE, INDEX_NAME)
  }

  const cols = await queryInterface.describeTable(TABLE)
  if (cols[COLUMN]) {
    await queryInterface.removeColumn(TABLE, COLUMN)
  }
}
