import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // 1. Update residents table
  const residentCols = await queryInterface.describeTable('residents')

  if (!residentCols.gender) {
    await queryInterface.addColumn('residents', 'gender', {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'),
      allowNull: true,
    })
  }

  if (!residentCols.dob) {
    await queryInterface.addColumn('residents', 'dob', {
      type: DataTypes.DATEONLY,
      allowNull: true,
    })
  }

  if (residentCols.photoUrl) {
    await queryInterface.changeColumn('residents', 'photoUrl', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  } else {
    await queryInterface.addColumn('residents', 'photoUrl', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  }

  // 2. Update resident_family_members table
  const fmCols = await queryInterface.describeTable('resident_family_members')

  if (!fmCols.bloodGroup) {
    await queryInterface.addColumn('resident_family_members', 'bloodGroup', {
      type: DataTypes.STRING(10),
      allowNull: true,
    })
  }

  if (fmCols.photoUrl) {
    await queryInterface.changeColumn('resident_family_members', 'photoUrl', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  } else {
    await queryInterface.addColumn('resident_family_members', 'photoUrl', {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const residentCols = await queryInterface.describeTable('residents')
  if (residentCols.gender) {
    await queryInterface.removeColumn('residents', 'gender')
  }
  if (residentCols.dob) {
    await queryInterface.removeColumn('residents', 'dob')
  }

  const fmCols = await queryInterface.describeTable('resident_family_members')
  if (fmCols.bloodGroup) {
    await queryInterface.removeColumn('resident_family_members', 'bloodGroup')
  }
}
