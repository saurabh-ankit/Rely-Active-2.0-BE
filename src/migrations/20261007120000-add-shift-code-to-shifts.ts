import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize'
import { generateShiftCode } from '../utils/roster.util.js'

const INDEX_NAME = 'shifts_location_id_shift_code'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const shiftCols = await queryInterface.describeTable('shifts')

  if (!shiftCols.shiftCode) {
    await queryInterface.addColumn('shifts', 'shiftCode', {
      type: DataTypes.STRING(20),
      allowNull: true,
    })
    console.log('✅ Added column shiftCode to shifts table')
  }

  const rows = await queryInterface.sequelize.query<{
    id: string
    name: string
    locationId: string
    shiftCode: string | null
  }>('SELECT id, name, locationId, shiftCode FROM shifts', { type: QueryTypes.SELECT })

  const usedByLocation = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.shiftCode) continue
    const used = usedByLocation.get(row.locationId) ?? new Set<string>()
    used.add(row.shiftCode)
    usedByLocation.set(row.locationId, used)
  }

  for (const row of rows) {
    if (row.shiftCode) continue
    const used = usedByLocation.get(row.locationId) ?? new Set<string>()
    let code = generateShiftCode(row.name)
    while (used.has(code)) code = generateShiftCode(row.name)
    used.add(code)
    usedByLocation.set(row.locationId, used)
    await queryInterface.sequelize.query('UPDATE shifts SET shiftCode = :code WHERE id = :id', {
      replacements: { code, id: row.id },
    })
  }

  await queryInterface.changeColumn('shifts', 'shiftCode', {
    type: DataTypes.STRING(20),
    allowNull: false,
  })

  const indexes = (await queryInterface.showIndex('shifts')) as Array<{ name: string }>
  if (!indexes.some((index) => index.name === INDEX_NAME)) {
    await queryInterface.addIndex('shifts', ['locationId', 'shiftCode'], { name: INDEX_NAME })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const indexes = (await queryInterface.showIndex('shifts')) as Array<{ name: string }>
  if (indexes.some((index) => index.name === INDEX_NAME)) {
    await queryInterface.removeIndex('shifts', INDEX_NAME)
  }

  const shiftCols = await queryInterface.describeTable('shifts')
  if (shiftCols.shiftCode) {
    await queryInterface.removeColumn('shifts', 'shiftCode')
    console.log('✅ Removed column shiftCode from shifts table')
  }
}
