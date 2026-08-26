import sequelize from '../db/index.js'
import { umzug } from './umzug.js'

async function authenticate() {
  await sequelize.authenticate()
}

export async function runMigrations() {
  await authenticate()
  const pending = await umzug.pending()
  if (pending.length === 0) {
    return []
  }
  return umzug.up()
}

export async function getMigrationStatus() {
  await authenticate()
  const [executed, pending] = await Promise.all([umzug.executed(), umzug.pending()])
  return {
    executed: executed.map(({ name, path: migrationPath }) => ({ name, path: migrationPath })),
    pending: pending.map(({ name, path: migrationPath }) => ({ name, path: migrationPath })),
  }
}

export async function rollbackLastMigration() {
  await authenticate()
  return umzug.down()
}

export async function getPendingMigrations() {
  await authenticate()
  return umzug.pending()
}

export async function getExecutedMigrations() {
  await authenticate()
  return umzug.executed()
}
