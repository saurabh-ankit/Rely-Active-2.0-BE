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

  if (tables.includes('asset_assignments')) {
    // Database already contains asset tables from previous migration run; modify columns directly
    try {
      await queryInterface.sequelize.query(
        "ALTER TABLE `asset_assignments` MODIFY COLUMN `assigneeType` ENUM('employee', 'resident', 'flat') NOT NULL;",
      )
    } catch (e) {
      console.warn('Could not alter asset_assignments.assigneeType:', e)
    }

    if (tables.includes('asset_compliance_training')) {
      try {
        await queryInterface.sequelize.query(
          "ALTER TABLE `asset_compliance_training` MODIFY COLUMN `requiredFor` ENUM('employee', 'resident', 'all') NOT NULL;",
        )
      } catch (e) {
        console.warn('Could not alter asset_compliance_training.requiredFor:', e)
      }
    }

    return
  }

  // 1. asset_categories
  await queryInterface.createTable('asset_categories', {
    ...commonFields,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  })

  // 2. asset_category_locations
  await queryInterface.createTable('asset_category_locations', {
    ...commonFields,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_categories', key: 'id' },
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
  })
  await queryInterface.addIndex('asset_category_locations', ['categoryId', 'locationId'], {
    unique: true,
    name: 'asset_category_location_unique',
  })

  // 3. asset_vendors
  await queryInterface.createTable('asset_vendors', {
    ...commonFields,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_categories', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    contactPerson: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    taxId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  })

  // 4. asset_vendor_locations
  await queryInterface.createTable('asset_vendor_locations', {
    ...commonFields,
    vendorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_vendors', key: 'id' },
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
  })
  await queryInterface.addIndex('asset_vendor_locations', ['vendorId', 'locationId'], {
    unique: true,
    name: 'asset_vendor_location_unique',
  })

  // 5. asset_vendor_custom_fields
  await queryInterface.createTable('asset_vendor_custom_fields', {
    ...commonFields,
    vendorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_vendors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    fieldName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fieldLabel: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fieldType: {
      type: DataTypes.ENUM('text', 'number', 'date', 'select', 'bool', 'document'),
      allowNull: false,
    },
    fieldValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    enumValues: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    defaultValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  })

  // 6. asset_items
  await queryInterface.createTable('asset_items', {
    ...commonFields,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_categories', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'asset_vendors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    model: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    manufacturer: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    specifications: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  })

  // 7. asset_item_locations
  await queryInterface.createTable('asset_item_locations', {
    ...commonFields,
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_items', key: 'id' },
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
  })
  await queryInterface.addIndex('asset_item_locations', ['itemId', 'locationId'], {
    unique: true,
    name: 'asset_item_location_unique',
  })

  // 8. assets
  await queryInterface.createTable('assets', {
    ...commonFields,
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_items', key: 'id' },
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
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'asset_vendors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    serialNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    assetTag: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    qrCode: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    purchaseDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    purchasePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    currentValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    warrantyEndDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    warrantyDocumentUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    condition: {
      type: DataTypes.ENUM('excellent', 'good', 'fair', 'poor'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('available', 'assigned', 'maintenance', 'retired', 'disposed'),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  })

  // 9. asset_assignments
  await queryInterface.createTable('asset_assignments', {
    ...commonFields,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    assigneeType: {
      type: DataTypes.ENUM('employee', 'resident', 'flat'),
      allowNull: false,
    },
    assigneeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    bedId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    roomId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    expectedReturnDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    returnedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    returnCondition: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  })

  // 10. asset_service_logs
  await queryInterface.createTable('asset_service_logs', {
    ...commonFields,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    serviceDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    serviceType: {
      type: DataTypes.ENUM('repair', 'preventive', 'inspection', 'cleaning', 'upgrade'),
      allowNull: false,
    },
    performedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'asset_vendors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    nextServiceDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completionStatus: {
      type: DataTypes.ENUM('pending', 'completed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    completedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completionRemarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  })

  // 11. asset_warranties
  await queryInterface.createTable('asset_warranties', {
    ...commonFields,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'asset_vendors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    warrantyStartDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    warrantyEndDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    warrantyType: {
      type: DataTypes.ENUM('manufacturer', 'extended', 'service_contract'),
      allowNull: false,
    },
    coverageDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    documentUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
  })

  // 12. asset_calibrations
  await queryInterface.createTable('asset_calibrations', {
    ...commonFields,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    calibrationDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    nextCalibrationDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    calibratedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    certificateNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    result: {
      type: DataTypes.ENUM('pass', 'fail'),
      allowNull: false,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    documentUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
  })

  // 13. asset_compliance_inspections
  await queryInterface.createTable('asset_compliance_inspections', {
    ...commonFields,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    inspectionType: {
      type: DataTypes.ENUM('routine', 'safety', 'regulatory', 'quality'),
      allowNull: false,
    },
    inspectorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    inspectionDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    nextInspectionDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    result: {
      type: DataTypes.ENUM('pass', 'fail'),
      allowNull: false,
    },
    findings: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    recommendations: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    documentUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
  })

  // 14. asset_compliance_certifications
  await queryInterface.createTable('asset_compliance_certifications', {
    ...commonFields,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    certificationType: {
      type: DataTypes.ENUM('regulatory', 'safety', 'quality', 'environmental'),
      allowNull: false,
    },
    certificateNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    issuingAuthority: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    issueDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    documentUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('valid', 'expired', 'expiring_soon', 'pending_renewal'),
      allowNull: false,
    },
  })

  // 15. asset_compliance_training
  await queryInterface.createTable('asset_compliance_training', {
    ...commonFields,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    trainingTitle: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    requiredFor: {
      type: DataTypes.ENUM('employee', 'resident', 'all'),
      allowNull: false,
    },
    validityPeriod: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  if (tables.includes('asset_compliance_training')) await queryInterface.dropTable('asset_compliance_training')
  if (tables.includes('asset_compliance_certifications'))
    await queryInterface.dropTable('asset_compliance_certifications')
  if (tables.includes('asset_compliance_inspections')) await queryInterface.dropTable('asset_compliance_inspections')
  if (tables.includes('asset_calibrations')) await queryInterface.dropTable('asset_calibrations')
  if (tables.includes('asset_warranties')) await queryInterface.dropTable('asset_warranties')
  if (tables.includes('asset_service_logs')) await queryInterface.dropTable('asset_service_logs')
  if (tables.includes('asset_assignments')) await queryInterface.dropTable('asset_assignments')
  if (tables.includes('assets')) await queryInterface.dropTable('assets')
  if (tables.includes('asset_item_locations')) await queryInterface.dropTable('asset_item_locations')
  if (tables.includes('asset_items')) await queryInterface.dropTable('asset_items')
  if (tables.includes('asset_vendor_custom_fields')) await queryInterface.dropTable('asset_vendor_custom_fields')
  if (tables.includes('asset_vendor_locations')) await queryInterface.dropTable('asset_vendor_locations')
  if (tables.includes('asset_vendors')) await queryInterface.dropTable('asset_vendors')
  if (tables.includes('asset_category_locations')) await queryInterface.dropTable('asset_category_locations')
  if (tables.includes('asset_categories')) await queryInterface.dropTable('asset_categories')
}
