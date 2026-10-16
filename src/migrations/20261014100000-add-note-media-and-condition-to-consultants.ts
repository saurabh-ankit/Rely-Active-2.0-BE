import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * `20260923240000-visiting-doctor-clinical-schema` only defines these columns when it
 * creates `consultants`; databases where the table already existed never got them, so
 * reading a resident's clinical chart failed with "Unknown column 'Consultant.attachments'".
 */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const columns = await queryInterface.describeTable('consultants')

  if (!columns.attachments) {
    await queryInterface.addColumn('consultants', 'attachments', {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Image/PDF files attached to the note (S3)',
    })
  }
  if (!columns.voiceNotes) {
    await queryInterface.addColumn('consultants', 'voiceNotes', {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Voice notes recorded with the note (S3)',
    })
  }
  if (!columns.condition) {
    await queryInterface.addColumn('consultants', 'condition', {
      type: DataTypes.ENUM('CRITICAL', 'STABLE', 'RECOVERING', 'GOOD'),
      allowNull: true,
      comment: 'Resident condition recorded by the doctor',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const columns = await queryInterface.describeTable('consultants')
  if (columns.condition) await queryInterface.removeColumn('consultants', 'condition')
  if (columns.voiceNotes) await queryInterface.removeColumn('consultants', 'voiceNotes')
  if (columns.attachments) await queryInterface.removeColumn('consultants', 'attachments')
}
