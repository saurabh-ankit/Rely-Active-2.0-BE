#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sequelize from '../config/db/index.js'
import {
  getExecutedMigrations,
  getMigrationStatus,
  getPendingMigrations,
  rollbackLastMigration,
  runMigrations,
} from '../config/migrations/runner.js'

const command = process.argv[2] ?? 'help'
const argument = process.argv[3]
const sourceMigrationsDirectory = path.resolve(process.cwd(), 'src/migrations')

function migrationTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '')
}

function migrationTemplate() {
  return `import type { QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  // Add forward migration logic here.
  void queryInterface
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  // Add rollback logic here.
  void queryInterface
}
`
}

async function createMigration(name?: string) {
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error('Migration name is required and must use kebab-case')
  }
  await mkdir(sourceMigrationsDirectory, { recursive: true })
  const filename = `${migrationTimestamp()}-${name}.ts`
  const filepath = path.join(sourceMigrationsDirectory, filename)
  await writeFile(filepath, migrationTemplate(), { encoding: 'utf8', flag: 'wx' })
  console.log(`Created migration: ${filepath}`)
}

function printMigrations(label: string, migrations: Array<{ name: string }>) {
  console.log(`${label} (${migrations.length})`)
  migrations.forEach(({ name }) => console.log(`  - ${name}`))
}

async function main() {
  try {
    switch (command) {
      case 'up':
      case 'migrate':
        printMigrations('Executed', await runMigrations())
        break
      case 'down':
      case 'undo':
        printMigrations('Rolled back', await rollbackLastMigration())
        break
      case 'status': {
        const status = await getMigrationStatus()
        printMigrations('Executed', status.executed)
        printMigrations('Pending', status.pending)
        break
      }
      case 'pending':
        printMigrations('Pending', await getPendingMigrations())
        break
      case 'executed':
        printMigrations('Executed', await getExecutedMigrations())
        break
      case 'create':
        await createMigration(argument)
        break
      case 'help':
        console.log('Usage: pnpm migrate <up|down|status|pending|executed|create name>')
        break
      default:
        throw new Error(`Unknown migration command: ${command}`)
    }
  } catch (error) {
    console.error('Migration command failed:', error)
    process.exitCode = 1
  } finally {
    await sequelize.close().catch((error: unknown) => {
      console.error('Failed to close database connection:', error)
      process.exitCode = 1
    })
  }
}

await main()
