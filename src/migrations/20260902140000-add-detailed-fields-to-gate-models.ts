import { QueryInterface, DataTypes } from 'sequelize'

export const up = async ({ context: queryInterface }: { context: QueryInterface }) => {
  // Add columns to gate_invites
  await queryInterface.addColumn('gate_invites', 'flatNumber', {
    type: DataTypes.STRING(50),
    allowNull: true,
  })
  await queryInterface.addColumn('gate_invites', 'numberOfPeople', {
    type: DataTypes.INTEGER,
    allowNull: true,
  })
  await queryInterface.addColumn('gate_invites', 'photo', {
    type: DataTypes.TEXT,
    allowNull: true,
  })
  await queryInterface.addColumn('gate_invites', 'vehicleNumber', {
    type: DataTypes.STRING(100),
    allowNull: true,
  })
  await queryInterface.addColumn('gate_invites', 'notes', {
    type: DataTypes.TEXT,
    allowNull: true,
  })
  await queryInterface.addColumn('gate_invites', 'company', {
    type: DataTypes.STRING(255),
    allowNull: true,
  })
  await queryInterface.addColumn('gate_invites', 'personToMeet', {
    type: DataTypes.STRING(255),
    allowNull: true,
  })

  // Add columns to gate_entries
  await queryInterface.addColumn('gate_entries', 'flatNumber', {
    type: DataTypes.STRING(50),
    allowNull: true,
  })
  await queryInterface.addColumn('gate_entries', 'numberOfPeople', {
    type: DataTypes.INTEGER,
    allowNull: true,
  })
  await queryInterface.addColumn('gate_entries', 'photo', {
    type: DataTypes.TEXT,
    allowNull: true,
  })
  await queryInterface.addColumn('gate_entries', 'notes', {
    type: DataTypes.TEXT,
    allowNull: true,
  })
  await queryInterface.addColumn('gate_entries', 'company', {
    type: DataTypes.STRING(255),
    allowNull: true,
  })
  await queryInterface.addColumn('gate_entries', 'personToMeet', {
    type: DataTypes.STRING(255),
    allowNull: true,
  })
}

export const down = async ({ context: queryInterface }: { context: QueryInterface }) => {
  // Remove columns from gate_invites
  await queryInterface.removeColumn('gate_invites', 'flatNumber')
  await queryInterface.removeColumn('gate_invites', 'numberOfPeople')
  await queryInterface.removeColumn('gate_invites', 'photo')
  await queryInterface.removeColumn('gate_invites', 'vehicleNumber')
  await queryInterface.removeColumn('gate_invites', 'notes')
  await queryInterface.removeColumn('gate_invites', 'company')
  await queryInterface.removeColumn('gate_invites', 'personToMeet')

  // Remove columns from gate_entries
  await queryInterface.removeColumn('gate_entries', 'flatNumber')
  await queryInterface.removeColumn('gate_entries', 'numberOfPeople')
  await queryInterface.removeColumn('gate_entries', 'photo')
  await queryInterface.removeColumn('gate_entries', 'notes')
  await queryInterface.removeColumn('gate_entries', 'company')
  await queryInterface.removeColumn('gate_entries', 'personToMeet')
}
