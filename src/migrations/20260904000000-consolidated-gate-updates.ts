import { QueryInterface, DataTypes, ModelAttributeColumnOptions, Model } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  const transaction = await queryInterface.sequelize.transaction()

  try {
    // 1. Rename table gate_invites -> gate_preapproved
    const tableNames = await queryInterface.showAllTables()
    if (tableNames.includes('gate_invites') && !tableNames.includes('gate_preapproved')) {
      await queryInterface.renameTable('gate_invites', 'gate_preapproved', { transaction })
    }

    // 2. Rename columns expectedDate/expectedTime -> startDate/startTime
    const preapprovedDesc = (await queryInterface.describeTable('gate_preapproved').catch(() => ({}))) as Record<
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

    const entriesDesc = (await queryInterface.describeTable('gate_entries').catch(() => ({}))) as Record<string, object>
    if (entriesDesc['flatNumber']) {
      await queryInterface.removeColumn('gate_entries', 'flatNumber', { transaction })
    }

    // 4. Add new columns to gate_preapproved
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
    await queryInterface.dropTable('guest_masters', { transaction })

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
