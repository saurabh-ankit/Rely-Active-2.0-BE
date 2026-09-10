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

const softDeleteFields = {
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (!tables.includes('shift_areas')) {
    await queryInterface.createTable('shift_areas', {
      ...commonFields,
      areaName: { type: DataTypes.STRING(255), allowNull: false },
      areaType: {
        type: DataTypes.ENUM(
          'Lobby Area',
          'Security Area',
          'Maintenance Area',
          'Kitchen Area',
          'Parking Area',
          'Office Area',
          'Storage Area',
          'Recreation Area',
          'Medical Area',
          'Others',
        ),
        allowNull: false,
      },
      location: { type: DataTypes.STRING(255), allowNull: false },
      capacity: { type: DataTypes.STRING(100), allowNull: true },
      status: {
        type: DataTypes.ENUM('Active', 'Inactive'),
        allowNull: false,
        defaultValue: 'Active',
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    })
    await queryInterface.addIndex('shift_areas', ['locationId'])
  }

  if (!tables.includes('shifts')) {
    await queryInterface.createTable('shifts', {
      ...commonFields,
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false },
      startTime: { type: DataTypes.STRING(5), allowNull: false },
      endTime: { type: DataTypes.STRING(5), allowNull: false },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      slotGenerationMode: {
        type: DataTypes.ENUM('Auto Generate', 'Manual'),
        allowNull: false,
        defaultValue: 'Auto Generate',
      },
      slotDuration: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 60 },
      numberOfSlots: { type: DataTypes.INTEGER, allowNull: true },
      ...softDeleteFields,
    })
    await queryInterface.addIndex('shifts', ['locationId'])
  }

  if (!tables.includes('shift_assignments')) {
    await queryInterface.createTable('shift_assignments', {
      ...commonFields,
      employeeId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      shiftId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      workingDays: { type: DataTypes.JSON, allowNull: true },
      areaId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'shift_areas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'property_units', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      blockId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'property_blocks', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      floorId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'property_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      slotTimeRange: { type: DataTypes.STRING(20), allowNull: true },
      ...softDeleteFields,
    })
    await queryInterface.addIndex('shift_assignments', ['employeeId'])
    await queryInterface.addIndex('shift_assignments', ['shiftId'])
    await queryInterface.addIndex('shift_assignments', ['locationId'])
  }

  if (!tables.includes('shift_dates')) {
    await queryInterface.createTable('shift_dates', {
      ...commonFields,
      employeeShiftAssignmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'shift_assignments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      status: {
        type: DataTypes.ENUM('upcoming', 'on_duty', 'completed', 'absent', 'covered', 'day_off'),
        allowNull: false,
        defaultValue: 'upcoming',
      },
      coveredByEmployeeId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      markedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      markedAt: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      leaveType: { type: DataTypes.STRING(50), allowNull: true },
      leaveNote: { type: DataTypes.TEXT, allowNull: true },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      areaId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'shift_areas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      ...softDeleteFields,
    })
    await queryInterface.addIndex('shift_dates', ['employeeShiftAssignmentId'])
    await queryInterface.addIndex('shift_dates', ['date'])
    await queryInterface.addIndex('shift_dates', ['locationId'])
  }

  if (!tables.includes('shift_resident_pools')) {
    await queryInterface.createTable('shift_resident_pools', {
      ...commonFields,
      shiftEmployeeDateId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'shift_dates', key: 'id' },
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
      fromTime: { type: DataTypes.STRING(5), allowNull: true },
      toTime: { type: DataTypes.STRING(5), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      ...softDeleteFields,
    })
    await queryInterface.addIndex('shift_resident_pools', ['shiftEmployeeDateId'])
    await queryInterface.addIndex('shift_resident_pools', ['residentId'])
    await queryInterface.addIndex('shift_resident_pools', ['locationId'])
  }

  if (!tables.includes('shift_settings')) {
    await queryInterface.createTable('shift_settings', {
      ...commonFields,
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      preShiftBufferMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
      postShiftBufferMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
    })
    await queryInterface.addIndex('shift_settings', ['locationId'], { unique: true })
  }

  if (!tables.includes('shift_role_policies')) {
    await queryInterface.createTable('shift_role_policies', {
      ...commonFields,
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      role: { type: DataTypes.STRING(50), allowNull: false },
      requiresShift: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      preShiftBufferMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
      postShiftBufferMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
      allowCover: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      allowSwap: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      allowDayOff: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    })
    await queryInterface.addIndex('shift_role_policies', ['locationId', 'role'], { unique: true })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = [
    'shift_role_policies',
    'shift_settings',
    'shift_resident_pools',
    'shift_dates',
    'shift_assignments',
    'shifts',
    'shift_areas',
  ]
  for (const table of tables) {
    await queryInterface.dropTable(table).catch(() => undefined)
  }
}
