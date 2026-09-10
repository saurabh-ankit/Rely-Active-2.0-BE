import { QueryInterface, DataTypes } from 'sequelize'

const normalizeTableNames = (tables: (string | { tableName: string })[]): string[] =>
  tables.map((t) => (typeof t === 'string' ? t : t.tableName))

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  const transaction = await queryInterface.sequelize.transaction()

  try {
    const tableNames = normalizeTableNames(await queryInterface.showAllTables())

    const commonFields = {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    }

    // 1. Fresh installs: create gate tables at the final schema if missing
    if (!tableNames.includes('gate_preapproved')) {
      await queryInterface.createTable(
        'gate_preapproved',
        {
          ...commonFields,
          locId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'properties', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          unitId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'property_units', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          residentId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'residents', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          visitorName: {
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          visitorPhone: {
            type: DataTypes.STRING(50),
            allowNull: true,
          },
          visitorType: {
            type: DataTypes.ENUM('Guest', 'Delivery', 'Cab', 'Office', 'Other'),
            allowNull: false,
          },
          startDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
          },
          startTime: {
            type: DataTypes.TIME,
            allowNull: true,
          },
          qrCode: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          qrCodeImage: {
            type: DataTypes.TEXT('long'),
            allowNull: true,
          },
          status: {
            type: DataTypes.ENUM('Pending', 'Scanned', 'Expired', 'Cancelled', 'Rejected'),
            allowNull: false,
            defaultValue: 'Pending',
          },
          visitorPhotos: { type: DataTypes.JSON, allowNull: true },
          vehicleNumber: { type: DataTypes.STRING(100), allowNull: true },
          notes: { type: DataTypes.TEXT, allowNull: true },
          company: { type: DataTypes.STRING(255), allowNull: true },
          personToMeet: { type: DataTypes.STRING(255), allowNull: true },
          scheduleType: { type: DataTypes.ENUM('ONCE', 'FREQUENT'), allowNull: true },
          endDate: { type: DataTypes.DATE, allowNull: true },
          endTime: { type: DataTypes.TIME, allowNull: true },
        },
        { transaction },
      )
    }

    if (!tableNames.includes('gate_entries')) {
      await queryInterface.createTable(
        'gate_entries',
        {
          ...commonFields,
          locId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'properties', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          preapprovedId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'gate_preapproved', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          entrySource: {
            type: DataTypes.ENUM('Preapproved', 'Walkin'),
            allowNull: false,
          },
          visitorType: {
            type: DataTypes.ENUM('Guest', 'Delivery', 'Cab', 'Office', 'Other'),
            allowNull: false,
          },
          visitorName: {
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          visitorPhone: {
            type: DataTypes.STRING(50),
            allowNull: true,
          },
          unitId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'property_units', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          status: {
            type: DataTypes.ENUM('PendingApproval', 'Approved', 'Rejected', 'Inside', 'Completed'),
            allowNull: false,
            defaultValue: 'PendingApproval',
          },
          clockedInAt: { type: DataTypes.DATE, allowNull: true },
          clockedOutAt: { type: DataTypes.DATE, allowNull: true },
          clockedInBy: { type: DataTypes.UUID, allowNull: true },
          clockedOutBy: { type: DataTypes.UUID, allowNull: true },
          approvedBy: { type: DataTypes.UUID, allowNull: true },
          vehicleNumber: { type: DataTypes.STRING(100), allowNull: true },
          visitorPhotos: { type: DataTypes.JSON, allowNull: true },
          numberOfPeople: { type: DataTypes.INTEGER, allowNull: true },
          notes: { type: DataTypes.TEXT, allowNull: true },
          company: { type: DataTypes.STRING(255), allowNull: true },
          personToMeet: { type: DataTypes.STRING(255), allowNull: true },
        },
        { transaction },
      )
    }

    if (!tableNames.includes('gate_entry_items')) {
      await queryInterface.createTable(
        'gate_entry_items',
        {
          ...commonFields,
          entryId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'gate_entries', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          itemName: {
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
          },
          isChecked: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
        },
        { transaction },
      )
    }

    await transaction.commit()
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  const transaction = await queryInterface.sequelize.transaction()

  try {
    await queryInterface.dropTable('gate_entry_items', { transaction }).catch(() => {})
    await transaction.commit()
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}
