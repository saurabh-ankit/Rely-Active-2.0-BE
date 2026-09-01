import { type QueryInterface } from 'sequelize'

export async function up(_context: { context: QueryInterface }): Promise<void> {
  // No sample data seeded - roster shifts, frequencies, and settings are created dynamically via UI
}

export async function down(_context: { context: QueryInterface }): Promise<void> {
  // No-op
}
