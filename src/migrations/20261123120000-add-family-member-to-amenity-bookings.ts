import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'amenity_slot_bookings'
const FM_INDEX = 'amenity_slot_bookings_family_member_idx'

/**
 * Lets a residing family member hold an amenity booking. A booking now belongs to exactly one person:
 * residentId for the resident, or familyMemberId for a family member (the other one is null).
 * Existing bookings keep their residentId. MySQL won't allow a CHECK on columns with cascading foreign
 * keys, so "exactly one of the two" is enforced by the booking service.
 */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const sequelize = queryInterface.sequelize
  const cols = await queryInterface.describeTable(TABLE)

  if (!cols.familyMemberId) {
    await queryInterface.addColumn(TABLE, 'familyMemberId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'resident_family_members', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Set when booked for a family member (residentId is then null)',
    })
    await queryInterface.addIndex(TABLE, ['familyMemberId', 'date', 'isDeleted'], { name: FM_INDEX })
  }

  if (cols.residentId && !cols.residentId.allowNull) {
    // MODIFY keeps the existing foreign key; only the NOT NULL is dropped.
    await sequelize.query(
      `ALTER TABLE ${TABLE} MODIFY residentId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL`,
    )
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const sequelize = queryInterface.sequelize
  const cols = await queryInterface.describeTable(TABLE)
  if (!cols.familyMemberId) return

  // Family-member bookings have no residentId; give them the family member's resident before NOT NULL.
  await sequelize.query(
    `UPDATE ${TABLE} b JOIN resident_family_members f ON f.id = b.familyMemberId
     SET b.residentId = f.residentId WHERE b.residentId IS NULL`,
  )
  await sequelize.query(
    `ALTER TABLE ${TABLE} MODIFY residentId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL`,
  )
  await queryInterface.removeIndex(TABLE, FM_INDEX).catch(() => undefined)
  await queryInterface.removeColumn(TABLE, 'familyMemberId')
}
