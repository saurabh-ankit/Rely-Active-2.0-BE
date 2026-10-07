import { randomUUID } from 'node:crypto'
import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Feedback & Advertisements module.
 *
 * - advertisements: per-property promotional ads (title, description, image).
 * - feedback_forms / feedback_questions: a form and its ordered questions.
 *   Once a form is SENT its questions are locked so answers stay consistent.
 * - feedback_form_recipients: the residents / employees a form was sent to,
 *   captured at send time, with their submission status.
 * - feedback_answers: one row per recipient per answered question.
 *
 * Access is granted through the SETTINGS resource (feedback and advertisements
 * live under Settings). On databases that still have the earlier FEEDBACK
 * resource, it is renamed to SETTINGS and permissions granted on it are moved.
 */

const SETTINGS_RESOURCE = {
  key: 'SETTINGS',
  name: 'Settings',
  description: 'Property settings, feedback forms & advertisements',
}

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

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (!tableNames.includes('advertisements')) {
    await queryInterface.createTable('advertisements', {
      ...idColumn,
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      title: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      imageUrl: { type: DataTypes.STRING(500), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...auditColumns,
    })
    await queryInterface.addIndex('advertisements', ['locationId', 'isDeleted'], {
      name: 'advertisements_location_idx',
    })
  }

  if (!tableNames.includes('feedback_forms')) {
    await queryInterface.createTable('feedback_forms', {
      ...idColumn,
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      title: { type: DataTypes.STRING(255), allowNull: false },
      expiryDate: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.ENUM('DRAFT', 'SENT'), allowNull: false, defaultValue: 'DRAFT' },
      audience: { type: DataTypes.ENUM('RESIDENTS', 'EMPLOYEES', 'BOTH'), allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...auditColumns,
    })
    await queryInterface.addIndex('feedback_forms', ['locationId', 'isDeleted'], {
      name: 'feedback_forms_location_idx',
    })
  }

  if (!tableNames.includes('feedback_questions')) {
    await queryInterface.createTable('feedback_questions', {
      ...idColumn,
      formId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'feedback_forms', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      questionText: { type: DataTypes.TEXT, allowNull: false },
      answerType: {
        type: DataTypes.ENUM('PARAGRAPH', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RATING'),
        allowNull: false,
      },
      options: { type: DataTypes.JSON, allowNull: true },
      ratingScale: { type: DataTypes.TINYINT, allowNull: true },
      isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ...auditColumns,
    })
    await queryInterface.addIndex('feedback_questions', ['formId'], { name: 'feedback_questions_form_idx' })
  }

  if (!tableNames.includes('feedback_form_recipients')) {
    await queryInterface.createTable('feedback_form_recipients', {
      ...idColumn,
      formId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'feedback_forms', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      recipientType: { type: DataTypes.ENUM('RESIDENT', 'EMPLOYEE'), allowNull: false },
      residentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: { type: DataTypes.ENUM('PENDING', 'SUBMITTED'), allowNull: false, defaultValue: 'PENDING' },
      submittedAt: { type: DataTypes.DATE, allowNull: true },
      ...auditColumns,
    })
    // A person receives a given form at most once.
    await queryInterface.addIndex('feedback_form_recipients', ['formId', 'residentId'], {
      unique: true,
      name: 'feedback_recipients_form_resident_unique',
    })
    await queryInterface.addIndex('feedback_form_recipients', ['formId', 'userId'], {
      unique: true,
      name: 'feedback_recipients_form_user_unique',
    })
  }

  if (!tableNames.includes('feedback_answers')) {
    await queryInterface.createTable('feedback_answers', {
      ...idColumn,
      recipientId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'feedback_form_recipients', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      questionId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'feedback_questions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      answerText: { type: DataTypes.TEXT, allowNull: true },
      selectedOptions: { type: DataTypes.JSON, allowNull: true },
      ratingValue: { type: DataTypes.TINYINT, allowNull: true },
      ...auditColumns,
    })
    await queryInterface.addIndex('feedback_answers', ['recipientId', 'questionId'], {
      unique: true,
      name: 'feedback_answers_recipient_question_unique',
    })
  }

  const now = new Date()
  const settingsId = await queryInterface.rawSelect('resources', { where: { key: 'SETTINGS' } }, ['id'])
  const feedbackId = await queryInterface.rawSelect('resources', { where: { key: 'FEEDBACK' } }, ['id'])

  if (!settingsId && feedbackId) {
    await queryInterface.bulkUpdate('resources', { ...SETTINGS_RESOURCE, updatedAt: now }, { key: 'FEEDBACK' })
  } else if (!settingsId) {
    await queryInterface.bulkInsert('resources', [
      { id: randomUUID(), ...SETTINGS_RESOURCE, isActive: true, isDeleted: false, createdAt: now, updatedAt: now },
    ])
  } else if (feedbackId) {
    await queryInterface.bulkDelete('resources', { key: 'FEEDBACK' })
  }

  await queryInterface.bulkUpdate(
    'user_location_permissions',
    { resourceKey: 'SETTINGS', updatedAt: now },
    { resourceKey: 'FEEDBACK' },
  )
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  for (const table of [
    'feedback_answers',
    'feedback_form_recipients',
    'feedback_questions',
    'feedback_forms',
    'advertisements',
  ]) {
    if (tableNames.includes(table)) await queryInterface.dropTable(table)
  }
  await queryInterface.bulkDelete('resources', { key: 'SETTINGS' })
}
