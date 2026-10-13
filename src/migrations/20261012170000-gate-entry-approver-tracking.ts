import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Who approved (or rejected) a gate entry, and who checked approved walk-ins in.
 *
 * `approvedBy` already exists but is a foreign key to users, so it can only hold
 * staff — while most approvals come from residents (pre-approving a visitor, or
 * approving a walk-in from the L1 app). These columns record any approver:
 *
 * - approverType: STAFF | RESIDENT | FAMILY_MEMBER
 * - approverName: name at the time of the decision (shown in lists without joins)
 * - approvedByResidentId: the household's resident for RESIDENT / FAMILY_MEMBER
 * - approvedAt: when the decision was made
 *
 * `approvedBy` keeps holding the staff user id for STAFF decisions. For a
 * Rejected entry the same columns name who rejected it.
 *
 * Backfill uses only what the data already proves:
 * - Pre-approved visitors that got in were approved by the resident who
 *   created the pass, at the time they created it.
 * - Pre-approved passes rejected at the gate were rejected by the guard the
 *   reject-scan flow stored in clockedInBy.
 * - Walk-ins a resident approved were let in without recording who checked
 *   them in; the guard who raised the walk-in is the one at the gate.
 * Older walk-in approvals were never recorded and stay empty.
 *
 * Every step checks first, so it is safe to run more than once.
 */

const TABLE = 'gate_entries'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const columns = await queryInterface.describeTable(TABLE)

  if (!columns.approverType) {
    await queryInterface.addColumn(TABLE, 'approverType', {
      type: DataTypes.ENUM('STAFF', 'RESIDENT', 'FAMILY_MEMBER'),
      allowNull: true,
    })
  }
  if (!columns.approverName) {
    await queryInterface.addColumn(TABLE, 'approverName', { type: DataTypes.STRING(255), allowNull: true })
  }
  if (!columns.approvedByResidentId) {
    await queryInterface.addColumn(TABLE, 'approvedByResidentId', {
      // UUID (CHAR(36) BINARY) to match residents.id's collation, which the FK requires.
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'residents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
  }
  if (!columns.approvedAt) {
    await queryInterface.addColumn(TABLE, 'approvedAt', { type: DataTypes.DATE, allowNull: true })
  }

  // Pre-approved visitors who got in: approved by the resident who created the pass.
  await queryInterface.sequelize.query(`
    UPDATE gate_entries e
    JOIN gate_preapproved p ON p.id = e.preapprovedId
    LEFT JOIN residents r ON r.id = p.residentId
    SET e.approverType = 'RESIDENT',
        e.approvedByResidentId = p.residentId,
        e.approverName = NULLIF(TRIM(CONCAT(COALESCE(r.firstName, ''), ' ', COALESCE(r.lastName, ''))), ''),
        e.approvedAt = p.createdAt
    WHERE e.entrySource = 'Preapproved'
      AND e.status IN ('Inside', 'Completed', 'Approved')
      AND p.residentId IS NOT NULL
      AND e.approverType IS NULL
  `)

  // Pre-approved passes rejected at the gate: the reject-scan flow stored the guard in clockedInBy.
  await queryInterface.sequelize.query(`
    UPDATE gate_entries e
    LEFT JOIN user_details ud ON ud.userId = e.clockedInBy
    SET e.approverType = 'STAFF',
        e.approvedBy = e.clockedInBy,
        e.approverName = NULLIF(TRIM(CONCAT(COALESCE(ud.firstName, ''), ' ', COALESCE(ud.lastName, ''))), ''),
        e.approvedAt = e.updatedAt
    WHERE e.status = 'Rejected'
      AND e.entrySource = 'Preapproved'
      AND e.clockedInAt IS NULL
      AND e.clockedInBy IS NOT NULL
      AND e.approverType IS NULL
  `)

  // Walk-ins approved by a resident: checked in by the guard who raised them.
  await queryInterface.sequelize.query(`
    UPDATE gate_entries e
    JOIN users u ON u.id = e.createdBy
    SET e.clockedInBy = e.createdBy
    WHERE e.entrySource = 'Walkin'
      AND e.clockedInAt IS NOT NULL
      AND e.clockedInBy IS NULL
  `)
}

// The data backfills are not undone; dropping the columns removes the approver data.
export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const columns = await queryInterface.describeTable(TABLE)
  if (columns.approvedByResidentId) await queryInterface.removeColumn(TABLE, 'approvedByResidentId')
  if (columns.approverName) await queryInterface.removeColumn(TABLE, 'approverName')
  if (columns.approverType) await queryInterface.removeColumn(TABLE, 'approverType')
  if (columns.approvedAt) await queryInterface.removeColumn(TABLE, 'approvedAt')
}
