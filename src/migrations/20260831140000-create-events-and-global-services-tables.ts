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

  if (!tables.includes('event_global_services')) {
    await queryInterface.createTable('event_global_services', {
      ...commonFields,
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      basePrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
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
    })
  }

  if (!tables.includes('event_global_service_properties')) {
    await queryInterface.createTable('event_global_service_properties', {
      ...commonFields,
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      globalServiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'event_global_services', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
    await queryInterface.addIndex('event_global_service_properties', ['locId', 'globalServiceId'], {
      unique: true,
    })
  }

  if (!tables.includes('event_venues')) {
    await queryInterface.createTable('event_venues', {
      ...commonFields,
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      occupancy: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      keyFeatures: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      otherServices: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      coverPhoto: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      images: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Array of image URLs with optional captions',
      },
      addOnServices: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Array of add-on services with name, image, and key features',
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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
  }

  if (!tables.includes('events')) {
    await queryInterface.createTable('events', {
      ...commonFields,
      eventType: {
        type: DataTypes.ENUM('regular', 'special'),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      venueId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'event_venues', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      allowReservation: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      maxCapacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      reservationPerFlat: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      frequencyType: {
        type: DataTypes.ENUM('once', 'daily', 'weekly', 'monthly', 'yearly', 'custom'),
        allowNull: false,
      },
      recurrenceDaysOfWeek: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      recurrenceDayOfWeek: {
        type: DataTypes.TINYINT,
        allowNull: true,
      },
      recurrenceDayOfMonth: {
        type: DataTypes.TINYINT,
        allowNull: true,
      },
      recurrenceMonth: {
        type: DataTypes.TINYINT,
        allowNull: true,
      },
      selectedServices: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Array of selected venue add-on services (snapshot)',
      },
      poster: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      entryFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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
  }

  if (!tables.includes('event_registrations')) {
    await queryInterface.createTable('event_registrations', {
      ...commonFields,
      eventId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'events', key: 'id' },
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
      status: {
        type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'ATTENDED', 'NO_SHOW'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      registeredAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      registrationDate: {
        type: DataTypes.DATEONLY,
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
      locationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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

    await queryInterface.addIndex('event_registrations', ['eventId', 'residentId', 'registrationDate'], {
      unique: true,
      name: 'unique_event_resident_registration',
    })
    await queryInterface.addIndex('event_registrations', ['eventId'], {
      name: 'event_registrations_eventId',
    })
    await queryInterface.addIndex('event_registrations', ['residentId'], {
      name: 'event_registrations_residentId',
    })
    await queryInterface.addIndex('event_registrations', ['status'], {
      name: 'event_registrations_status',
    })
    await queryInterface.addIndex('event_registrations', ['locationId'], {
      name: 'event_registrations_locationId',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.dropTable('event_registrations')
  await queryInterface.dropTable('events')
  await queryInterface.dropTable('event_venues')
  await queryInterface.dropTable('event_global_service_properties')
  await queryInterface.dropTable('event_global_services')
}
