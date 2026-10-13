import { randomUUID } from 'node:crypto'
import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Resident incidents reported by nurses: type, severity, time, notes, photos and voice notes (S3).
 * Also the Standard Operating Procedure checklists for Skin/Wound and Fall/Injury incidents:
 * seeded step definitions per incident type, and per-incident step progress.
 */

const TABLE = 'resident_incidents'
const STEPS_TABLE = 'incident_sop_steps'
const PROGRESS_TABLE = 'resident_incident_sop_steps'

const INCIDENT_TYPES = ['fall_injury', 'skin_wound', 'behavior', 'env_temp', 'bathroom', 'refusal', 'other']
const STEP_KEYS = [
  'test',
  'first_aid',
  'medicines',
  'bed_rest',
  'check_1',
  'step_1',
  'step_2',
  'step_3',
  'qwertyu',
  'step_234567',
  'step_12345678',
]

const SEED_STEPS: { incidentType: string; stepKey: string; title: string; isMandatory: boolean }[] = [
  { incidentType: 'skin_wound', stepKey: 'test', title: 'Test', isMandatory: true },
  { incidentType: 'skin_wound', stepKey: 'first_aid', title: 'First AID', isMandatory: false },
  { incidentType: 'skin_wound', stepKey: 'medicines', title: 'Medicines', isMandatory: true },
  { incidentType: 'skin_wound', stepKey: 'bed_rest', title: 'bed Rest', isMandatory: false },
  { incidentType: 'fall_injury', stepKey: 'check_1', title: 'check 1', isMandatory: true },
  { incidentType: 'fall_injury', stepKey: 'step_1', title: 'step 1', isMandatory: true },
  { incidentType: 'fall_injury', stepKey: 'step_2', title: 'step 2', isMandatory: true },
  { incidentType: 'fall_injury', stepKey: 'step_3', title: 'step 3', isMandatory: false },
  { incidentType: 'fall_injury', stepKey: 'qwertyu', title: 'qwertyu', isMandatory: true },
  { incidentType: 'fall_injury', stepKey: 'step_234567', title: '234567', isMandatory: true },
  { incidentType: 'fall_injury', stepKey: 'step_12345678', title: '12345678', isMandatory: true },
]

const auditColumns = {
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}

const idColumn = {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
}

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

async function createIncidentsTable(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(TABLE, {
    ...idColumn,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'residents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    incidentType: { type: DataTypes.ENUM(...INCIDENT_TYPES), allowNull: false },
    severity: { type: DataTypes.ENUM('low', 'moderate', 'high', 'critical'), allowNull: false },
    incidentAt: { type: DataTypes.DATE, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    photos: { type: DataTypes.JSON, allowNull: false },
    voiceNotes: { type: DataTypes.JSON, allowNull: false },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...auditColumns,
  })

  await queryInterface.addIndex(TABLE, ['residentId', 'incidentAt'], {
    name: 'idx_resident_incidents_resident_incident_at',
  })
  console.log(`✅ Created table ${TABLE}`)
}

async function createSopStepsTable(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(STEPS_TABLE, {
    ...idColumn,
    incidentType: { type: DataTypes.ENUM(...INCIDENT_TYPES), allowNull: false },
    stepKey: { type: DataTypes.ENUM(...STEP_KEYS), allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    isMandatory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ...auditColumns,
  })
  await queryInterface.addIndex(STEPS_TABLE, ['incidentType', 'stepKey'], {
    unique: true,
    name: 'uq_incident_sop_steps_type_key',
  })

  const now = new Date()
  const orderByType: Record<string, number> = {}
  await queryInterface.bulkInsert(
    STEPS_TABLE,
    SEED_STEPS.map((step) => {
      orderByType[step.incidentType] = (orderByType[step.incidentType] ?? 0) + 1
      return {
        id: randomUUID(),
        ...step,
        sortOrder: orderByType[step.incidentType],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }
    }),
  )
  console.log(`✅ Created and seeded table ${STEPS_TABLE}`)
}

async function createSopProgressTable(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(PROGRESS_TABLE, {
    ...idColumn,
    incidentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: TABLE, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    sopStepId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: STEPS_TABLE, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    isCompleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    note: { type: DataTypes.TEXT, allowNull: true },
    ...auditColumns,
  })
  await queryInterface.addIndex(PROGRESS_TABLE, ['incidentId', 'sopStepId'], {
    unique: true,
    name: 'uq_resident_incident_sop_steps_incident_step',
  })
  console.log(`✅ Created table ${PROGRESS_TABLE}`)
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes(TABLE)) await createIncidentsTable(queryInterface)
  if (!tableNames.includes(STEPS_TABLE)) await createSopStepsTable(queryInterface)
  if (!tableNames.includes(PROGRESS_TABLE)) await createSopProgressTable(queryInterface)
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(PROGRESS_TABLE)) await queryInterface.dropTable(PROGRESS_TABLE)
  if (tableNames.includes(STEPS_TABLE)) await queryInterface.dropTable(STEPS_TABLE)
  if (tableNames.includes(TABLE)) await queryInterface.dropTable(TABLE)
}
