import { QueryInterface, DataTypes } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.removeColumn('gate_invites', 'flatNumber')
  await queryInterface.removeColumn('gate_entries', 'flatNumber')
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.addColumn('gate_invites', 'flatNumber', { type: DataTypes.STRING(50) })
  await queryInterface.addColumn('gate_entries', 'flatNumber', { type: DataTypes.STRING(50) })
}
