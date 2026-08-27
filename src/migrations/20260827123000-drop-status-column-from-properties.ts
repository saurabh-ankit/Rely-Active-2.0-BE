import { type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  try {
    await queryInterface.removeColumn('properties', 'status')
  } catch (_e) {
    // Column status already dropped or does not exist
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  // Down migration optional
}
