import { DataTypes, type QueryInterface } from 'sequelize'

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

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (tables.includes('roster_shifts')) {
    const shiftTable = await queryInterface.describeTable('roster_shifts')
    if (!shiftTable.departmentId) {
      await queryInterface.addColumn('roster_shifts', 'departmentId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      })
    }
    if (!shiftTable.shiftCategory) {
      await queryInterface.addColumn('roster_shifts', 'shiftCategory', {
        type: DataTypes.ENUM('GENERAL', 'DEPARTMENT', 'OPD'),
        allowNull: false,
        defaultValue: 'GENERAL',
      })
    }
  }

  if (tables.includes('scheduling_resources')) {
    const srTable = await queryInterface.describeTable('scheduling_resources')
    if (!srTable.departmentId) {
      await queryInterface.addColumn('scheduling_resources', 'departmentId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      })
    }
  }

  if (tables.includes('roster_assignments')) {
    const assignTable = await queryInterface.describeTable('roster_assignments')
    if (!assignTable.slotDurationMinutes) {
      await queryInterface.addColumn('roster_assignments', 'slotDurationMinutes', {
        type: DataTypes.INTEGER,
        allowNull: true,
      })
    }
    if (!assignTable.slotBufferMinutes) {
      await queryInterface.addColumn('roster_assignments', 'slotBufferMinutes', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      })
    }
    if (!assignTable.enableOpdSlots) {
      await queryInterface.addColumn('roster_assignments', 'enableOpdSlots', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      })
    }
  }

  if (!tables.includes('roster_opd_slots')) {
    await queryInterface.createTable('roster_opd_slots', {
      ...commonFields,
      rosterAssignmentDateId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'roster_assignment_dates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      slotNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      scheduledStart: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      scheduledEnd: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      maxCapacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      bookedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM('AVAILABLE', 'PARTIALLY_BOOKED', 'FULL', 'BLOCKED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'AVAILABLE',
      },
      activeToken: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
    await queryInterface.addIndex('roster_opd_slots', ['rosterAssignmentDateId', 'slotNumber', 'activeToken'], {
      unique: true,
      name: 'uq_opd_slot_date_num_active',
    })
  }

  if (!tables.includes('roster_opd_bookings')) {
    await queryInterface.createTable('roster_opd_bookings', {
      ...commonFields,
      opdSlotId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'roster_opd_slots', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      bookedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      status: {
        type: DataTypes.ENUM('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'),
        allowNull: false,
        defaultValue: 'CONFIRMED',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      cancelledReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      activeToken: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
    await queryInterface.addIndex('roster_opd_bookings', ['opdSlotId', 'residentId', 'activeToken'], {
      unique: true,
      name: 'uq_opd_booking_slot_resident_active',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.dropTable('roster_opd_bookings')
  await queryInterface.dropTable('roster_opd_slots')

  const assignTable = await queryInterface.describeTable('roster_assignments')
  if (assignTable.enableOpdSlots) await queryInterface.removeColumn('roster_assignments', 'enableOpdSlots')
  if (assignTable.slotBufferMinutes) await queryInterface.removeColumn('roster_assignments', 'slotBufferMinutes')
  if (assignTable.slotDurationMinutes) await queryInterface.removeColumn('roster_assignments', 'slotDurationMinutes')

  const srTable = await queryInterface.describeTable('scheduling_resources')
  if (srTable.departmentId) await queryInterface.removeColumn('scheduling_resources', 'departmentId')

  const shiftTable = await queryInterface.describeTable('roster_shifts')
  if (shiftTable.shiftCategory) await queryInterface.removeColumn('roster_shifts', 'shiftCategory')
  if (shiftTable.departmentId) await queryInterface.removeColumn('roster_shifts', 'departmentId')
}
