import { DataTypes, type QueryInterface } from 'sequelize'

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (!tableNames.includes('amenity_slot_configs')) {
    await queryInterface.createTable('amenity_slot_configs', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      propertyAmenityId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'property_amenities', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      openMinutes: { type: DataTypes.INTEGER, allowNull: false },
      closeMinutes: { type: DataTypes.INTEGER, allowNull: false },
      durationMin: { type: DataTypes.INTEGER, allowNull: false },
      capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      daysOfWeek: { type: DataTypes.JSON, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })

    await queryInterface.addIndex('amenity_slot_configs', ['propertyAmenityId'], {
      name: 'amenity_slot_configs_property_amenity_unique',
      unique: true,
    })
    await queryInterface.addIndex('amenity_slot_configs', ['isDeleted'], {
      name: 'amenity_slot_configs_deleted_idx',
    })
  }

  if (!tableNames.includes('amenity_slot_bookings')) {
    await queryInterface.createTable('amenity_slot_bookings', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      slotConfigId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'amenity_slot_configs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      startMinutes: { type: DataTypes.INTEGER, allowNull: false },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: DataTypes.ENUM('BOOKED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'BOOKED',
      },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })

    await queryInterface.addIndex(
      'amenity_slot_bookings',
      ['slotConfigId', 'date', 'startMinutes', 'status', 'isDeleted'],
      {
        name: 'amenity_slot_bookings_lookup_idx',
      },
    )
    await queryInterface.addIndex('amenity_slot_bookings', ['residentId', 'date', 'isDeleted'], {
      name: 'amenity_slot_bookings_resident_idx',
    })
  }

  if (!tableNames.includes('amenity_slot_blocks')) {
    await queryInterface.createTable('amenity_slot_blocks', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      slotConfigId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'amenity_slot_configs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      startMinutes: { type: DataTypes.INTEGER, allowNull: false },
      reason: { type: DataTypes.STRING(500), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })

    await queryInterface.addIndex('amenity_slot_blocks', ['slotConfigId', 'date', 'startMinutes'], {
      name: 'amenity_slot_blocks_unique',
      unique: true,
    })
    await queryInterface.addIndex('amenity_slot_blocks', ['slotConfigId', 'date', 'isDeleted'], {
      name: 'amenity_slot_blocks_lookup_idx',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (tableNames.includes('amenity_slot_blocks')) {
    await queryInterface.dropTable('amenity_slot_blocks')
  }
  if (tableNames.includes('amenity_slot_bookings')) {
    await queryInterface.dropTable('amenity_slot_bookings')
  }
  if (tableNames.includes('amenity_slot_configs')) {
    await queryInterface.dropTable('amenity_slot_configs')
  }
}
