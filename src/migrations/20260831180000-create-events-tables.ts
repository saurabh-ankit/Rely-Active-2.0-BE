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

  if (tables.includes('venues')) {
    return
  }

  await queryInterface.createTable('venues', {
    ...commonFields,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    occupancy: {
      type: DataTypes.INTEGER,
      allowNull: false,
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

  await queryInterface.createTable('events', {
    ...commonFields,
    eventType: {
      type: DataTypes.ENUM(
        'conference',
        'seminar',
        'workshop',
        'meeting',
        'birthday',
        'wedding',
        'party',
        'concert',
        'exhibition',
        'other',
      ),
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
      references: { model: 'venues', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    allowReservation: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    frequencyType: {
      type: DataTypes.ENUM('once', 'daily', 'weekly', 'monthly', 'yearly', 'custom'),
      allowNull: false,
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

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.dropTable('event_registrations')
  await queryInterface.dropTable('events')
  await queryInterface.dropTable('venues')
}
