import { QueryInterface, DataTypes } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.addColumn('gate_invites', 'qrCodeImage', {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.removeColumn('gate_invites', 'qrCodeImage')
}
