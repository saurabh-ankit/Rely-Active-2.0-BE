import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SequelizeStorage, Umzug } from 'umzug'
import type { UmzugStorage } from 'umzug'
import sequelize from '../db/index.js'
import { logger } from '../logger.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const runtimeExtension = path.extname(fileURLToPath(import.meta.url))
const migrationsGlob = path.resolve(currentDirectory, `../../migrations/*${runtimeExtension}`)

export function migrationName(filename: string) {
  return path.basename(filename, path.extname(filename))
}

const sequelizeStorage = new SequelizeStorage({ sequelize, tableName: 'sequelize_meta' })
const storage: UmzugStorage = {
  logMigration: (params) => sequelizeStorage.logMigration(params),
  executed: async () => [...new Set((await sequelizeStorage.executed()).map(migrationName))],
  unlogMigration: async ({ name }) => {
    await Promise.all(
      [name, `${name}.ts`, `${name}.js`].map((storedName) => sequelizeStorage.unlogMigration({ name: storedName })),
    )
  },
}

export const umzug = new Umzug({
  migrations: {
    glob: migrationsGlob,
    resolve: ({ name, path: migrationPath, context }) => {
      if (!migrationPath) throw new Error(`Migration path is missing for ${name}`)
      const resolved = Umzug.defaultResolver({ name, path: migrationPath, context })
      return { ...resolved, name: migrationName(name) }
    },
  },
  context: sequelize.getQueryInterface(),
  storage,
  logger: {
    debug: (message) => logger.debug(message),
    info: (message) => logger.info(message),
    warn: (message) => logger.warn(message),
    error: (message) => logger.error(message),
  },
})

export type Migration = typeof umzug._types.migration
