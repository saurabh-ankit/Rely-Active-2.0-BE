import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const userCols = await queryInterface.describeTable('users')

  if (!userCols.lastLogin) {
    await queryInterface.addColumn('users', 'lastLogin', {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp of the most recent successful login',
    })
    console.log('✅ Added column lastLogin to users table')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const userCols = await queryInterface.describeTable('users')
  if (userCols.lastLogin) {
    await queryInterface.removeColumn('users', 'lastLogin')
    console.log('✅ Removed column lastLogin from users table')
  }
}
