import { type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  try {
    await queryInterface.removeColumn('properties', 'status')
  } catch {
    // Column status already dropped or does not exist
  }
}

export async function down({ context: _queryInterface }: { context: QueryInterface }) {
  // Down migration optional
}
