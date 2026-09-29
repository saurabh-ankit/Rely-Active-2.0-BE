import type { QueryInterface } from 'sequelize'

/**
 * The `user_locations` table has a spurious unique constraint
 * `user_locations_roleId_userId_unique` that only covers `roleId` alone.
 * This means at most one user_location row can exist per role across the
 * entire system, so any second user assigned the same role will fail with
 * a duplicate-key 500 error during user creation.
 *
 * Fix: add a plain non-unique index on roleId first (needed so MySQL can
 * continue enforcing the FK to roles.id), then drop the unique constraint.
 */

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // 1. Check if the bad unique constraint exists
  const rows = (await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'user_locations'
        AND CONSTRAINT_NAME = 'user_locations_roleId_userId_unique'
        AND CONSTRAINT_TYPE = 'UNIQUE'`,
  )) as [Array<{ CONSTRAINT_NAME: string }>, unknown]

  if (rows[0].length > 0) {
    // 2. Add a non-unique index first so the FK to roles.id is still supported
    const idxRows = (await queryInterface.sequelize.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_locations'
          AND INDEX_NAME = 'idx_user_locations_roleId'`,
    )) as [Array<{ INDEX_NAME: string }>, unknown]

    if (idxRows[0].length === 0) {
      await queryInterface.addIndex('user_locations', ['roleId'], {
        name: 'idx_user_locations_roleId',
        unique: false,
      })
    }

    // 3. Now safely drop the unique constraint
    await queryInterface.removeConstraint('user_locations', 'user_locations_roleId_userId_unique')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // Rollback: drop the plain index and re-add the (broken) unique constraint
  await queryInterface.removeIndex('user_locations', 'idx_user_locations_roleId')
  await queryInterface.addConstraint('user_locations', {
    fields: ['roleId'],
    type: 'unique',
    name: 'user_locations_roleId_userId_unique',
  })
}
