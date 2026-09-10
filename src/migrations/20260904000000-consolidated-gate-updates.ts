import { QueryInterface, DataTypes, ModelAttributeColumnOptions, Model } from 'sequelize'

const commonFields = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
  updatedBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}

function normalizeTableNames(rawTables: Awaited<ReturnType<QueryInterface['showAllTables']>>): string[] {
  return rawTables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  const transaction = await queryInterface.sequelize.transaction()

  try {
    let tableNames = normalizeTableNames(await queryInterface.showAllTables())

    // 1. Rename table gate_invites -> gate_preapproved (legacy installs)
    if (tableNames.includes('gate_invites') && !tableNames.includes('gate_preapproved')) {
      await queryInterface.renameTable('gate_invites', 'gate_preapproved', { transaction })
      tableNames = normalizeTableNames(await queryInterface.showAllTables())
    }

    // 1b. Fresh installs: create gate tables at the final schema
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

    // 2. Rename columns expectedDate/expectedTime -> startDate/startTime (legacy)
    const preapprovedDesc = (await queryInterface.describeTable('gate_preapproved', { transaction })) as Record<
      string,
      object
    >

    if (preapprovedDesc['expectedDate'] && !preapprovedDesc['startDate']) {
      await queryInterface.renameColumn('gate_preapproved', 'expectedDate', 'startDate', { transaction })
    }
    if (preapprovedDesc['expectedTime'] && !preapprovedDesc['startTime']) {
      await queryInterface.renameColumn('gate_preapproved', 'expectedTime', 'startTime', { transaction })
    }

    // 3. Remove flatNumber from gate_preapproved and gate_entries
    if (preapprovedDesc['flatNumber']) {
      await queryInterface.removeColumn('gate_preapproved', 'flatNumber', { transaction })
    }

    const entriesDesc = (await queryInterface.describeTable('gate_entries', { transaction })) as Record<string, object>
    if (entriesDesc['flatNumber']) {
      await queryInterface.removeColumn('gate_entries', 'flatNumber', { transaction })
    }

    // 4. Add new columns to gate_preapproved (legacy installs missing them)
    const newPreapprovedCols = {
      visitorPhotos: { type: DataTypes.JSON, allowNull: true },
      vehicleNumber: { type: DataTypes.STRING(100), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      company: { type: DataTypes.STRING(255), allowNull: true },
      personToMeet: { type: DataTypes.STRING(255), allowNull: true },
      scheduleType: { type: DataTypes.ENUM('ONCE', 'FREQUENT'), allowNull: true },
      endDate: { type: DataTypes.DATE, allowNull: true },
      endTime: { type: DataTypes.TIME, allowNull: true },
      qrCodeImage: { type: DataTypes.TEXT('long'), allowNull: true },
    }

    for (const [colName, colDef] of Object.entries(newPreapprovedCols)) {
      if (!preapprovedDesc[colName]) {
        await queryInterface.addColumn('gate_preapproved', colName, colDef as ModelAttributeColumnOptions<Model>, {
          transaction,
        })
      }
    }

    // 4.5 Add 'Rejected' to gate_preapproved status enum
    await queryInterface.changeColumn(
      'gate_preapproved',
      'status',
      {
        type: DataTypes.ENUM('Pending', 'Scanned', 'Expired', 'Cancelled', 'Rejected'),
        defaultValue: 'Pending',
      },
      { transaction },
    )

    // 5. Update gate_entries references & columns
    if (entriesDesc['inviteId'] && !entriesDesc['preapprovedId']) {
      try {
        await queryInterface.removeConstraint('gate_entries', 'gate_entries_ibfk_2', { transaction })
      } catch {
        /* ignore */
      }
      try {
        await queryInterface.removeConstraint('gate_entries', 'gate_entries_inviteId_foreign_idx', { transaction })
      } catch {
        /* ignore */
      }

      await queryInterface.renameColumn('gate_entries', 'inviteId', 'preapprovedId', { transaction })

      await queryInterface.addConstraint('gate_entries', {
        fields: ['preapprovedId'],
        type: 'foreign key',
        name: 'gate_entries_ibfk_2',
        references: {
          table: 'gate_preapproved',
          field: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      })
    }

    const newEntriesCols = {
      visitorPhotos: { type: DataTypes.JSON, allowNull: true },
      numberOfPeople: { type: DataTypes.INTEGER, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      company: { type: DataTypes.STRING(255), allowNull: true },
      personToMeet: { type: DataTypes.STRING(255), allowNull: true },
    }

    for (const [colName, colDef] of Object.entries(newEntriesCols)) {
      if (!entriesDesc[colName]) {
        await queryInterface.addColumn('gate_entries', colName, colDef as ModelAttributeColumnOptions<Model>, {
          transaction,
        })
      }
    }

    // 6. Create guest_masters table
    const guestMastersDesc = await queryInterface.describeTable('guest_masters').catch(() => null)
    if (!guestMastersDesc) {
      await queryInterface.createTable(
        'guest_masters',
        {
          id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          locId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
              model: 'properties',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          unitId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
              model: 'property_units',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          name: {
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          phone: {
            type: DataTypes.STRING(50),
            allowNull: true,
          },
          notes: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
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
    await queryInterface.dropTable('guest_masters', { transaction }).catch(() => {})
    await queryInterface.dropTable('gate_entry_items', { transaction }).catch(() => {})

    const newEntriesCols = ['visitorPhotos', 'numberOfPeople', 'notes', 'company', 'personToMeet']
    for (const colName of newEntriesCols) {
      await queryInterface.removeColumn('gate_entries', colName, { transaction }).catch(() => {})
    }

    const newPreapprovedCols = [
      'visitorPhotos',
      'vehicleNumber',
      'notes',
      'company',
      'personToMeet',
      'scheduleType',
      'endDate',
      'endTime',
      'qrCodeImage',
    ]
    for (const colName of newPreapprovedCols) {
      await queryInterface.removeColumn('gate_preapproved', colName, { transaction }).catch(() => {})
    }

    await queryInterface
      .addColumn('gate_preapproved', 'flatNumber', { type: DataTypes.STRING(50) }, { transaction })
      .catch(() => {})
    await queryInterface
      .addColumn('gate_entries', 'flatNumber', { type: DataTypes.STRING(50) }, { transaction })
      .catch(() => {})

    await queryInterface.renameColumn('gate_preapproved', 'startDate', 'expectedDate', { transaction }).catch(() => {})
    await queryInterface.renameColumn('gate_preapproved', 'startTime', 'expectedTime', { transaction }).catch(() => {})

    await queryInterface
      .changeColumn(
        'gate_preapproved',
        'status',
        {
          type: DataTypes.ENUM('Pending', 'Scanned', 'Expired', 'Cancelled'),
          defaultValue: 'Pending',
        },
        { transaction },
      )
      .catch(() => {})

    try {
      await queryInterface.removeConstraint('gate_entries', 'gate_entries_ibfk_2', { transaction })
    } catch {
      /* ignore */
    }

    await queryInterface.renameColumn('gate_entries', 'preapprovedId', 'inviteId', { transaction }).catch(() => {})
    await queryInterface.renameTable('gate_preapproved', 'gate_invites', { transaction }).catch(() => {})

    await transaction.commit()
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}
