import { DataTypes, QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tableDescription = await queryInterface.describeTable('user_details')

  if (!tableDescription.phone) {
    await queryInterface.addColumn('user_details', 'phone', {
      type: DataTypes.STRING(30),
      allowNull: true,
    })
  }

  if (!tableDescription.gender) {
    await queryInterface.addColumn('user_details', 'gender', {
      type: DataTypes.STRING(30),
      allowNull: true,
    })
  }

  if (!tableDescription.dateOfBirth) {
    await queryInterface.addColumn('user_details', 'dateOfBirth', {
      type: DataTypes.DATEONLY,
      allowNull: true,
    })
  }

  if (!tableDescription.emergencyContact) {
    await queryInterface.addColumn('user_details', 'emergencyContact', {
      type: DataTypes.STRING(30),
      allowNull: true,
    })
  }

  if (!tableDescription.bloodGroup) {
    await queryInterface.addColumn('user_details', 'bloodGroup', {
      type: DataTypes.STRING(20),
      allowNull: true,
    })
  }

  if (!tableDescription.address) {
    await queryInterface.addColumn('user_details', 'address', {
      type: DataTypes.TEXT,
      allowNull: true,
    })
  }

  if (!tableDescription.qualification) {
    await queryInterface.addColumn('user_details', 'qualification', {
      type: DataTypes.STRING(150),
      allowNull: true,
    })
  }

  if (!tableDescription.experience) {
    await queryInterface.addColumn('user_details', 'experience', {
      type: DataTypes.STRING(50),
      allowNull: true,
    })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tableDescription = await queryInterface.describeTable('user_details')

  if (tableDescription.experience) await queryInterface.removeColumn('user_details', 'experience')
  if (tableDescription.qualification) await queryInterface.removeColumn('user_details', 'qualification')
  if (tableDescription.address) await queryInterface.removeColumn('user_details', 'address')
  if (tableDescription.bloodGroup) await queryInterface.removeColumn('user_details', 'bloodGroup')
  if (tableDescription.emergencyContact) await queryInterface.removeColumn('user_details', 'emergencyContact')
  if (tableDescription.dateOfBirth) await queryInterface.removeColumn('user_details', 'dateOfBirth')
  if (tableDescription.gender) await queryInterface.removeColumn('user_details', 'gender')
  if (tableDescription.phone) await queryInterface.removeColumn('user_details', 'phone')
}
