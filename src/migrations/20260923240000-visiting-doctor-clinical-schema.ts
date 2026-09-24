/**
 * Visiting doctor + diagnosis clinical schema (final state).
 * Consolidates clinical, lab settings/reports, and insulin into one idempotent migration.
 */
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

function tableNames(raw: Awaited<ReturnType<QueryInterface['showAllTables']>>): string[] {
  return raw.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

async function addColumnIfMissing(
  queryInterface: QueryInterface,
  table: string,
  column: string,
  definition: Parameters<QueryInterface['addColumn']>[2],
): Promise<void> {
  const desc = await queryInterface.describeTable(table)
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, definition)
  }
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  let tables = tableNames(await queryInterface.showAllTables())

  // ── user_details: consultantFee + weekOffDays ─────────────────────────────
  if (tables.includes('user_details')) {
    await addColumnIfMissing(queryInterface, 'user_details', 'consultantFee', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    })
    await addColumnIfMissing(queryInterface, 'user_details', 'weekOffDays', {
      type: DataTypes.JSON,
      allowNull: true,
    })
  }

  // ── doctor_appointments (includes familyMemberId) ─────────────────────────
  if (!tables.includes('doctor_appointments')) {
    await queryInterface.createTable('doctor_appointments', {
      ...commonFields,
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      shiftEmployeeDateId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'shift_dates', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      familyMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'resident_family_members', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      doctorId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      appointmentDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      slotTimeRange: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'ATTENDED', 'NO_SHOW'),
        allowNull: false,
        defaultValue: 'CONFIRMED',
      },
      bookedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cancellationReason: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      attendedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
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

    await queryInterface.addIndex('doctor_appointments', ['locationId'], {
      name: 'doctor_appointments_location_id_idx',
    })
    await queryInterface.addIndex('doctor_appointments', ['shiftEmployeeDateId'], {
      name: 'doctor_appointments_shift_employee_date_id_idx',
    })
    await queryInterface.addIndex('doctor_appointments', ['residentId'], {
      name: 'doctor_appointments_resident_id_idx',
    })
    await queryInterface.addIndex('doctor_appointments', ['doctorId'], {
      name: 'doctor_appointments_doctor_id_idx',
    })
    await queryInterface.addIndex('doctor_appointments', ['familyMemberId'], {
      name: 'doctor_appointments_family_member_id_idx',
    })
    await queryInterface.addIndex('doctor_appointments', ['shiftEmployeeDateId', 'slotTimeRange'], {
      name: 'doctor_appointments_shift_date_slot_idx',
    })
    await queryInterface.addIndex('doctor_appointments', ['shiftEmployeeDateId', 'residentId'], {
      name: 'doctor_appointments_shift_date_resident_idx',
    })
  } else {
    await addColumnIfMissing(queryInterface, 'doctor_appointments', 'familyMemberId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'resident_family_members', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  tables = tableNames(await queryInterface.showAllTables())

  // ── vital_settings (thresholds flattened — no vital_thresholds table) ─────
  if (!tables.includes('vital_settings')) {
    await queryInterface.createTable('vital_settings', {
      ...commonFields,
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(60),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      imageUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      unit: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      inputType: {
        type: DataTypes.ENUM('single', 'composite'),
        allowNull: false,
        defaultValue: 'single',
      },
      lowRiskyBelow: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      lowBelow: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      normalMin: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      normalMax: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      highAbove: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      highRiskyAbove: {
        type: DataTypes.DECIMAL(10, 2),
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

    await queryInterface.addIndex('vital_settings', ['name'], {
      name: 'vital_settings_name_idx',
    })
    await queryInterface.addIndex('vital_settings', ['code'], {
      name: 'vital_settings_code_idx',
    })
  } else {
    for (const col of ['lowRiskyBelow', 'lowBelow', 'normalMin', 'normalMax', 'highAbove', 'highRiskyAbove'] as const) {
      await addColumnIfMissing(queryInterface, 'vital_settings', col, {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      })
    }
  }

  // Drop leftover intermediate tables if present
  tables = tableNames(await queryInterface.showAllTables())
  if (tables.includes('vital_thresholds')) {
    await queryInterface.dropTable('vital_thresholds')
  }
  if (tables.includes('resident_diagnoses')) {
    await queryInterface.dropTable('resident_diagnoses')
  }

  tables = tableNames(await queryInterface.showAllTables())

  // ── resident_allergies (with appointmentId) ───────────────────────────────
  if (!tables.includes('resident_allergies')) {
    await queryInterface.createTable('resident_allergies', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'doctor_appointments', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      recordedAt: {
        type: DataTypes.DATE,
        allowNull: false,
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

    await queryInterface.addIndex('resident_allergies', ['residentId'], {
      name: 'resident_allergies_resident_id_idx',
    })
    await queryInterface.addIndex('resident_allergies', ['locationId'], {
      name: 'resident_allergies_location_id_idx',
    })
    await queryInterface.addIndex('resident_allergies', ['appointmentId'], {
      name: 'resident_allergies_appointment_id_idx',
    })
  } else {
    await addColumnIfMissing(queryInterface, 'resident_allergies', 'appointmentId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'doctor_appointments', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  // ── resident_medications ──────────────────────────────────────────────────
  if (!tables.includes('resident_medications')) {
    await queryInterface.createTable('resident_medications', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'doctor_appointments', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      inventoryItemId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'inventory_items', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      medicineName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      isUntilDischarge: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      timings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      note: {
        type: DataTypes.TEXT,
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

    await queryInterface.addIndex('resident_medications', ['residentId'], {
      name: 'resident_medications_resident_id_idx',
    })
    await queryInterface.addIndex('resident_medications', ['locationId'], {
      name: 'resident_medications_location_id_idx',
    })
    await queryInterface.addIndex('resident_medications', ['inventoryItemId'], {
      name: 'resident_medications_inventory_item_id_idx',
    })
    await queryInterface.addIndex('resident_medications', ['appointmentId'], {
      name: 'resident_medications_appointment_id_idx',
    })
  }

  // ── resident_insulin ──────────────────────────────────────────────────────
  if (!tables.includes('resident_insulin')) {
    await queryInterface.createTable('resident_insulin', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'doctor_appointments', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      inventoryItemId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'inventory_items', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      medicineName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      isUntilDischarge: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      timings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      note: {
        type: DataTypes.TEXT,
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

    await queryInterface.addIndex('resident_insulin', ['residentId'], {
      name: 'resident_insulin_resident_id_idx',
    })
    await queryInterface.addIndex('resident_insulin', ['locationId'], {
      name: 'resident_insulin_location_id_idx',
    })
    await queryInterface.addIndex('resident_insulin', ['inventoryItemId'], {
      name: 'resident_insulin_inventory_item_id_idx',
    })
    await queryInterface.addIndex('resident_insulin', ['appointmentId'], {
      name: 'resident_insulin_appointment_id_idx',
    })
  }

  // ── consultants ───────────────────────────────────────────────────────────
  if (!tables.includes('consultants')) {
    await queryInterface.createTable('consultants', {
      ...commonFields,
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'doctor_appointments', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      doctorId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      allergies: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      vitals: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      medications: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      insulin: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('DRAFT', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      completedAt: {
        type: DataTypes.DATE,
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

    await queryInterface.addIndex('consultants', ['appointmentId'], {
      unique: true,
      name: 'consultants_appointment_id_idx',
    })
    await queryInterface.addIndex('consultants', ['residentId'], {
      name: 'consultants_resident_id_idx',
    })
    await queryInterface.addIndex('consultants', ['doctorId'], {
      name: 'consultants_doctor_id_idx',
    })
    await queryInterface.addIndex('consultants', ['locationId'], {
      name: 'consultants_location_id_idx',
    })
    await queryInterface.addIndex('consultants', ['status'], {
      name: 'consultants_status_idx',
    })
  } else {
    await addColumnIfMissing(queryInterface, 'consultants', 'insulin', {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    })
  }

  tables = tableNames(await queryInterface.showAllTables())

  // ── lab_test_settings ─────────────────────────────────────────────────────
  if (!tables.includes('lab_test_settings')) {
    await queryInterface.createTable('lab_test_settings', {
      ...commonFields,
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      instructions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      imageUrl: {
        type: DataTypes.STRING(500),
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

    await queryInterface.addIndex('lab_test_settings', ['name'], {
      name: 'lab_test_settings_name_idx',
    })
    await queryInterface.addIndex('lab_test_settings', ['isActive', 'isDeleted'], {
      name: 'lab_test_settings_active_idx',
    })
  }

  tables = tableNames(await queryInterface.showAllTables())

  // ── resident_lab_reports ──────────────────────────────────────────────────
  if (!tables.includes('resident_lab_reports')) {
    await queryInterface.createTable('resident_lab_reports', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      labTestSettingId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      severity: {
        type: DataTypes.ENUM('normal', 'abnormal', 'severe'),
        allowNull: false,
      },
      reportDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      paymentMethod: {
        type: DataTypes.ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'NEFT', 'RTGS', 'CARD', 'OTHER'),
        allowNull: true,
      },
      reportFileUrl: {
        type: DataTypes.STRING(1000),
        allowNull: false,
      },
      receiptFileUrl: {
        type: DataTypes.STRING(1000),
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

    await queryInterface.addIndex('resident_lab_reports', ['residentId'], {
      name: 'idx_resident_lab_reports_resident',
    })
    await queryInterface.addIndex('resident_lab_reports', ['locationId'], {
      name: 'idx_resident_lab_reports_location',
    })
    await queryInterface.addIndex('resident_lab_reports', ['labTestSettingId'], {
      name: 'idx_resident_lab_reports_setting',
    })
    await queryInterface.addIndex('resident_lab_reports', ['isDeleted', 'reportDate'], {
      name: 'idx_resident_lab_reports_deleted_date',
    })
  }

  tables = tableNames(await queryInterface.showAllTables())

  // ── resident_vitals (final schema with value/unit/appointment/vitalSetting) ─
  if (!tables.includes('resident_vitals')) {
    await queryInterface.createTable('resident_vitals', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'doctor_appointments', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      vitalSettingId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'vital_settings', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      unit: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      value: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      recordedAt: {
        type: DataTypes.DATE,
        allowNull: false,
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

    await queryInterface.addIndex('resident_vitals', ['residentId'], {
      name: 'resident_vitals_resident_id_idx',
    })
    await queryInterface.addIndex('resident_vitals', ['locationId'], {
      name: 'resident_vitals_location_id_idx',
    })
    await queryInterface.addIndex('resident_vitals', ['appointmentId'], {
      name: 'resident_vitals_appointment_id_idx',
    })
    await queryInterface.addIndex('resident_vitals', ['vitalSettingId'], {
      name: 'resident_vitals_vital_setting_id_idx',
    })
  } else {
    await addColumnIfMissing(queryInterface, 'resident_vitals', 'appointmentId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'doctor_appointments', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
    await addColumnIfMissing(queryInterface, 'resident_vitals', 'vitalSettingId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'vital_settings', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
    await addColumnIfMissing(queryInterface, 'resident_vitals', 'unit', {
      type: DataTypes.STRING(20),
      allowNull: true,
    })
    await addColumnIfMissing(queryInterface, 'resident_vitals', 'value', {
      type: DataTypes.STRING(100),
      allowNull: true,
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = tableNames(await queryInterface.showAllTables())

  for (const table of [
    'resident_lab_reports',
    'lab_test_settings',
    'resident_vitals',
    'resident_insulin',
    'resident_medications',
    'resident_allergies',
    'consultants',
    'vital_settings',
    'doctor_appointments',
  ]) {
    if (tables.includes(table)) {
      await queryInterface.dropTable(table)
    }
  }

  if (tables.includes('user_details')) {
    const desc = await queryInterface.describeTable('user_details')
    if (desc.weekOffDays) await queryInterface.removeColumn('user_details', 'weekOffDays')
    if (desc.consultantFee) await queryInterface.removeColumn('user_details', 'consultantFee')
  }
}
