import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  // 1. Update any existing properties with status 'upcoming' to 'under_construction'
  await queryInterface.sequelize.query(
    `UPDATE properties SET status = 'under_construction' WHERE status = 'upcoming'`
  )

  // 2. Modify status column ENUM to remove 'upcoming'
  await queryInterface.changeColumn('properties', 'status', {
    type: DataTypes.ENUM('under_construction', 'ready_to_move', 'sold_out'),
    allowNull: false,
    defaultValue: 'under_construction',
    comment: 'Current status of the property project',
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.changeColumn('properties', 'status', {
    type: DataTypes.ENUM('upcoming', 'under_construction', 'ready_to_move', 'sold_out'),
    allowNull: false,
    defaultValue: 'under_construction',
    comment: 'Current status of the property project',
  })
}
