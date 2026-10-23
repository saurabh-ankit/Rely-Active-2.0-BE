import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'resident_lab_reports'
const COLUMN = 'is_paid'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const cols = await queryInterface.describeTable(TABLE)
  if (!cols[COLUMN]) {
    await queryInterface.addColumn(TABLE, COLUMN, {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether the lab report was already paid (shows payment method + receipt)',
    })
  }

  await queryInterface.sequelize.query(`
    UPDATE ${TABLE}
    SET ${COLUMN} = 1
    WHERE paymentMethod IS NOT NULL OR receiptFileUrl IS NOT NULL
  `)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const cols = await queryInterface.describeTable(TABLE)
  if (cols[COLUMN]) {
    await queryInterface.removeColumn(TABLE, COLUMN)
  }
}
