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

  // 1. Doctor Profiles
  if (!tables.includes('roster_doctor_profiles')) {
    await queryInterface.createTable('roster_doctor_profiles', {
      ...commonFields,
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      doctorType: {
        type: DataTypes.ENUM('IN_HOUSE', 'VISITING'),
        allowNull: false,
        defaultValue: 'IN_HOUSE',
      },
      specialization: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      medicalLicenseNumber: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      licenseExpiryDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      consultationFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      maxPatientsPerSlot: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      defaultSlotDurationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
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
    })
    await queryInterface.addIndex('roster_doctor_profiles', ['userId'], { unique: true, name: 'idx_doc_prof_user' })
  }

  // 2. Scheduling Resources (Physical Abstraction for Database Integrity)
  if (!tables.includes('scheduling_resources')) {
    await queryInterface.createTable('scheduling_resources', {
      ...commonFields,
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'company', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      resourceType: {
        type: DataTypes.ENUM('EMPLOYEE', 'DOCTOR'),
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      doctorProfileId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'roster_doctor_profiles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      effectiveFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      effectiveUntil: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
    await queryInterface.addIndex('scheduling_resources', ['companyId', 'resourceType'], { name: 'idx_sched_res_comp_type' })
  }

  // 3. Doctor Locations Junction Table
  if (!tables.includes('roster_doctor_locations')) {
    await queryInterface.createTable('roster_doctor_locations', {
      ...commonFields,
      doctorProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'roster_doctor_profiles', key: 'id' },
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
      validFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      validUntil: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
    await queryInterface.addIndex('roster_doctor_locations', ['doctorProfileId', 'locationId'], { name: 'idx_doc_loc_prof_loc' })
  }

  // 4. Doctor Engagements Table
  if (!tables.includes('roster_doctor_engagements')) {
    await queryInterface.createTable('roster_doctor_engagements', {
      ...commonFields,
      doctorProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'roster_doctor_profiles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'company', key: 'id' },
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
      validFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      validUntil: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      serviceCategory: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      clinicRoomId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'property_units', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      defaultSlotCapacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 15,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
  }

  // 5. Shift Master Templates
  if (!tables.includes('roster_shifts')) {
    await queryInterface.createTable('roster_shifts', {
      ...commonFields,
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'company', key: 'id' },
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
      shiftName: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      startTime: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      endTime: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      breakStartTime: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      breakEndTime: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      slotGenerationMode: {
        type: DataTypes.ENUM('AUTO_GENERATE', 'MANUAL'),
        allowNull: false,
        defaultValue: 'AUTO_GENERATE',
      },
      slotDurationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
      },
      numberOfSlots: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
    await queryInterface.addIndex('roster_shifts', ['locationId', 'code'], { name: 'idx_shift_loc_code' })
  }

  // 6. Roster Frequencies
  if (!tables.includes('roster_frequencies')) {
    await queryInterface.createTable('roster_frequencies', {
      ...commonFields,
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'company', key: 'id' },
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
      frequencyName: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      frequencyType: {
        type: DataTypes.ENUM('ONCE', 'DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'CUSTOM'),
        allowNull: false,
        defaultValue: 'WEEKLY',
      },
      interval: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      timeUnit: {
        type: DataTypes.ENUM('DAYS', 'WEEKS', 'MONTHS'),
        allowNull: false,
        defaultValue: 'WEEKS',
      },
      allowedDaysOfWeek: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      monthlyDays: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
  }

  // 7. Roster Assignments Header
  if (!tables.includes('roster_assignments')) {
    await queryInterface.createTable('roster_assignments', {
      ...commonFields,
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'company', key: 'id' },
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
      rosterName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      schedulingResourceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'scheduling_resources', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      shiftId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'roster_shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      slotTimeRange: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      frequencyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'roster_frequencies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      effectiveFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      effectiveUntil: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      selectedWorkingDays: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      instructions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('DRAFT', 'VALIDATED', 'PUBLISHED', 'LOCKED', 'ACTIVE', 'COMPLETED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
    await queryInterface.addIndex('roster_assignments', ['locationId', 'schedulingResourceId', 'status'], { name: 'idx_assign_loc_res_stat' })
  }

  // 8. Roster Assignment Targets
  if (!tables.includes('roster_assignment_targets')) {
    await queryInterface.createTable('roster_assignment_targets', {
      ...commonFields,
      rosterAssignmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'roster_assignments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      targetType: {
        type: DataTypes.ENUM(
          'PROPERTY',
          'PROPERTY_BLOCK',
          'PROPERTY_FLOOR',
          'PROPERTY_UNIT',
          'DEPARTMENT',
          'CLINIC_VENUE',
          'SERVICE',
        ),
        allowNull: false,
      },
      targetId: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
    })
    await queryInterface.addIndex('roster_assignment_targets', ['rosterAssignmentId', 'targetType', 'targetId'], { name: 'idx_target_assign_type_id' })
  }

  // 9. Roster Assignment Dates (Concrete Operational Commitment & Snapshots)
  if (!tables.includes('roster_assignment_dates')) {
    await queryInterface.createTable('roster_assignment_dates', {
      ...commonFields,
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'company', key: 'id' },
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
      rosterAssignmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'roster_assignments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      assignmentDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      schedulingResourceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'scheduling_resources', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      shiftId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'roster_shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      scheduledStart: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      scheduledEnd: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      slotTimeRange: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      shiftNameSnapshot: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      targetSnapshot: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      resourceSnapshot: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      slotCapacitySnapshot: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          'UPCOMING',
          'ON_DUTY',
          'COMPLETED',
          'ABSENT',
          'COVERED',
          'REPLACEMENT_REQUIRED',
          'REPLACED',
          'CANCELLED',
        ),
        allowNull: false,
        defaultValue: 'UPCOMING',
      },
      activeToken: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'ACTIVE',
        comment: 'MySQL surrogate token: ACTIVE when valid, UUID string when cancelled/deleted',
      },
      coveredByResourceId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'scheduling_resources', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      overrideReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      markedBy: {
        type: DataTypes.CHAR(36),
        allowNull: true,
      },
      markedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
    await queryInterface.addIndex(
      'roster_assignment_dates',
      ['locationId', 'schedulingResourceId', 'assignmentDate', 'scheduledStart', 'activeToken'],
      { unique: true, name: 'uq_resource_schedule_active' },
    )
  }

  // 10. Roster Replacements
  if (!tables.includes('roster_replacements')) {
    await queryInterface.createTable('roster_replacements', {
      ...commonFields,
      rosterAssignmentDateId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'roster_assignment_dates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      originalResourceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'scheduling_resources', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      replacementResourceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'scheduling_resources', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('REQUESTED', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'REQUESTED',
      },
      approvedBy: {
        type: DataTypes.CHAR(36),
        allowNull: true,
      },
      approvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    })
  }

  // 11. Roster Settings
  if (!tables.includes('roster_settings')) {
    await queryInterface.createTable('roster_settings', {
      ...commonFields,
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'company', key: 'id' },
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
      preShiftBufferMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
      },
      postShiftBufferMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 120,
      },
      minRestPeriodHours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 11,
      },
      maxWeeklyHours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 48,
      },
      minMultiPropertyTravelMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })
    await queryInterface.addIndex('roster_settings', ['companyId', 'locationId'], { unique: true, name: 'uq_setting_comp_loc' })
  }

  // 12. Roster Audit Logs
  if (!tables.includes('roster_audit_logs')) {
    await queryInterface.createTable('roster_audit_logs', {
      ...commonFields,
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'company', key: 'id' },
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
      entityType: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      entityId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      previousValues: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      newValues: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      overrideReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      performedBy: {
        type: DataTypes.CHAR(36),
        allowNull: false,
      },
    })
    await queryInterface.addIndex('roster_audit_logs', ['locationId', 'entityType', 'entityId'], { name: 'idx_audit_loc_ent' })
  }

}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0;')
  await queryInterface.dropTable('roster_audit_logs')
  await queryInterface.dropTable('roster_settings')
  await queryInterface.dropTable('roster_replacements')
  await queryInterface.dropTable('roster_assignment_dates')
  await queryInterface.dropTable('roster_assignment_targets')
  await queryInterface.dropTable('roster_assignments')
  await queryInterface.dropTable('roster_frequencies')
  await queryInterface.dropTable('roster_shifts')
  await queryInterface.dropTable('roster_doctor_engagements')
  await queryInterface.dropTable('roster_doctor_locations')
  await queryInterface.dropTable('scheduling_resources')
  await queryInterface.dropTable('roster_doctor_profiles')
  await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1;')
}
