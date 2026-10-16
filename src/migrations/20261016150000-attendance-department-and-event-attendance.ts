import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize'
import { randomUUID } from 'node:crypto'

/**
 * Attendance staff mark residents' dine-in and event attendance from the L3 app.
 *
 * - Event type: 'special' = confirmed from a resident's request, or a one-time event created before
 *   the type was decoupled from frequency (2026-10-15); every other event is 'regular'.
 * - event_registrations.attendanceMarkedBy records who marked a registration Attended / No-show.
 * - event_registrations.familyMemberId: at events without reservations each person who came (the
 *   resident, or a family member) has their own registration under the resident, so the entry fee
 *   is billed to the flat tagged with that person. The unique key becomes one row per person.
 * - event_attendees: at events with reservations, each person who came under a reservation, with
 *   when they came and who marked them. A reservation can't have more people than seats booked.
 * - Adds the Attendance department (ATT) with its Attendance Operations (ATT_OPS) job category.
 *
 * Every step checks what already exists, so it is safe on a fresh database or one that already
 * has some of these changes.
 */

const OLD_UNIQUE = 'unique_event_resident_registration'
const PERSON_UNIQUE = 'unique_event_person_registration'

const indexNames = async (queryInterface: QueryInterface, table: string) =>
  ((await queryInterface.showIndex(table)) as { name: string }[]).map((i) => i.name)

const dropForeignKeys = async (queryInterface: QueryInterface, table: string, column: string) => {
  const fks = (await queryInterface.getForeignKeyReferencesForTable(table)) as {
    columnName: string
    constraintName: string
  }[]
  for (const fk of fks.filter((f) => f.columnName === column)) {
    await queryInterface.removeConstraint(table, fk.constraintName)
  }
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const sequelize = queryInterface.sequelize

  // ── 1. Event types ─────────────────────────────────────────────────────────
  await sequelize.query(`
    UPDATE events e SET eventType = CASE
      WHEN EXISTS (SELECT 1 FROM event_requests r WHERE r.confirmedEventId = e.id) THEN 'special'
      WHEN e.frequencyType = 'once' AND e.createdAt < '2026-10-15 12:40:00' THEN 'special'
      ELSE 'regular' END`)

  // ── 2. event_registrations: who marked it, and which family member ─────────
  const regCols = await queryInterface.describeTable('event_registrations')
  if (!regCols.attendanceMarkedBy) {
    await queryInterface.addColumn('event_registrations', 'attendanceMarkedBy', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }
  if (!regCols.familyMemberId) {
    await queryInterface.addColumn('event_registrations', 'familyMemberId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'resident_family_members', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }
  const regIndexes = await indexNames(queryInterface, 'event_registrations')
  if (!regIndexes.includes('idx_event_registrations_person')) {
    await queryInterface.addIndex('event_registrations', ['eventId', 'residentId', 'familyMemberId'], {
      name: 'idx_event_registrations_person',
    })
  }
  if (!regIndexes.includes(PERSON_UNIQUE)) {
    await queryInterface.addIndex(
      'event_registrations',
      ['eventId', 'residentId', 'registrationDate', 'familyMemberId'],
      {
        unique: true,
        name: PERSON_UNIQUE,
      },
    )
  }
  if (regIndexes.includes(OLD_UNIQUE)) await queryInterface.removeIndex('event_registrations', OLD_UNIQUE)

  // ── 3. event_attendees ─────────────────────────────────────────────────────
  const tables = (await queryInterface.showAllTables()).map((t) => String(t).toLowerCase())
  if (!tables.includes('event_attendees')) {
    await queryInterface.createTable('event_attendees', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      registrationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'event_registrations', key: 'id' },
        onDelete: 'CASCADE',
      },
      eventId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'events', key: 'id' },
        onDelete: 'CASCADE',
      },
      residentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'residents', key: 'id' } },
      familyMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'resident_family_members', key: 'id' },
        onDelete: 'SET NULL',
      },
      markedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      markedAt: { type: DataTypes.DATE, allowNull: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('event_attendees', ['registrationId', 'familyMemberId'], {
      name: 'idx_event_attendees_person',
    })
    await queryInterface.addIndex('event_attendees', ['eventId'], { name: 'idx_event_attendees_event' })
  }

  // ── 4. Attendance department and job category ──────────────────────────────
  const now = new Date()
  const [dept] = await sequelize.query<{ id: string }>("SELECT id FROM departments WHERE code = 'ATT' LIMIT 1", {
    type: QueryTypes.SELECT,
  })
  const deptId = dept?.id ?? randomUUID()
  if (!dept) {
    await queryInterface.bulkInsert('departments', [
      {
        id: deptId,
        code: 'ATT',
        name: 'Attendance',
        description: 'Dine-in and event attendance',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }
  const [category] = await sequelize.query<{ id: string }>(
    "SELECT id FROM job_categories WHERE code = 'ATT_OPS' LIMIT 1",
    { type: QueryTypes.SELECT },
  )
  if (!category) {
    await queryInterface.bulkInsert('job_categories', [
      {
        id: randomUUID(),
        departmentId: deptId,
        code: 'ATT_OPS',
        name: 'Attendance Operations',
        description: 'Attendance Operations',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = (await queryInterface.showAllTables()).map((t) => String(t).toLowerCase())
  if (tables.includes('event_attendees')) await queryInterface.dropTable('event_attendees')

  const regIndexes = await indexNames(queryInterface, 'event_registrations')
  if (!regIndexes.includes(OLD_UNIQUE)) {
    await queryInterface.addIndex('event_registrations', ['eventId', 'residentId', 'registrationDate'], {
      unique: true,
      name: OLD_UNIQUE,
    })
  }
  if (regIndexes.includes(PERSON_UNIQUE)) await queryInterface.removeIndex('event_registrations', PERSON_UNIQUE)

  const regCols = await queryInterface.describeTable('event_registrations')
  if (regCols.familyMemberId) {
    await dropForeignKeys(queryInterface, 'event_registrations', 'familyMemberId')
    if (regIndexes.includes('idx_event_registrations_person')) {
      await queryInterface.removeIndex('event_registrations', 'idx_event_registrations_person')
    }
    await queryInterface.removeColumn('event_registrations', 'familyMemberId')
  }
  if (regCols.attendanceMarkedBy) {
    await dropForeignKeys(queryInterface, 'event_registrations', 'attendanceMarkedBy')
    await queryInterface.removeColumn('event_registrations', 'attendanceMarkedBy')
  }
  // Event types and the Attendance department are left as they are.
}
