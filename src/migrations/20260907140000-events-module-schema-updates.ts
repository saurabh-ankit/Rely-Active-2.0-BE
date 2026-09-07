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

function listTables(rawTables: Awaited<ReturnType<QueryInterface['showAllTables']>>): string[] {
  return rawTables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = listTables(await queryInterface.showAllTables())

  // 1. Add events.occupancy if missing
  if (tables.includes('events')) {
    const eventsDesc = await queryInterface.describeTable('events')
    if (!eventsDesc.occupancy) {
      await queryInterface.addColumn('events', 'occupancy', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      })
    }
  }

  // 2. Fix events.venueId FK → event_venues (orphan cleanup + drop legacy venues FK)
  if (tables.includes('events') && tables.includes('event_venues')) {
    await queryInterface.sequelize.query(`
      DELETE er FROM event_registrations er
      INNER JOIN events e ON er.eventId = e.id
      LEFT JOIN event_venues ev ON e.venueId = ev.id
      WHERE ev.id IS NULL
    `)

    await queryInterface.sequelize.query(`
      DELETE e FROM events e
      LEFT JOIN event_venues ev ON e.venueId = ev.id
      WHERE ev.id IS NULL
    `)

    const [constraints] = (await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'events'
        AND COLUMN_NAME = 'venueId'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `)) as [Array<{ CONSTRAINT_NAME: string; REFERENCED_TABLE_NAME: string }>, unknown]

    let hasEventVenuesFk = false

    for (const constraint of constraints) {
      if (constraint.REFERENCED_TABLE_NAME === 'event_venues') {
        hasEventVenuesFk = true
        continue
      }
      await queryInterface.removeConstraint('events', constraint.CONSTRAINT_NAME)
    }

    if (!hasEventVenuesFk) {
      await queryInterface.addConstraint('events', {
        fields: ['venueId'],
        type: 'foreign key',
        name: 'events_venueId_event_venues_fk',
        references: {
          table: 'event_venues',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      })
    }
  }

  // 3. Add event_registrations.seatCount if missing
  if (tables.includes('event_registrations')) {
    const regsDesc = await queryInterface.describeTable('event_registrations')
    if (!regsDesc.seatCount) {
      await queryInterface.addColumn('event_registrations', 'seatCount', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      })
    }
  }

  // 4. Make events.description nullable if currently NOT NULL
  if (tables.includes('events')) {
    const eventsDesc = await queryInterface.describeTable('events')
    if (eventsDesc.description && !eventsDesc.description.allowNull) {
      await queryInterface.changeColumn('events', 'description', {
        type: DataTypes.TEXT,
        allowNull: true,
      })
    }
  }

  // 5. Create event_requests with final schema if missing
  if (!tables.includes('event_requests')) {
    await queryInterface.createTable('event_requests', {
      ...commonFields,
      title: {
        type: DataTypes.STRING(255),
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
      occupancy: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      venueId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'event_venues', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      customRequest: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
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
      status: {
        type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'CLOSED', 'REJECTED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'OPEN',
      },
      schedule: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      selectedServices: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      requestNumber: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
      },
      meetingScheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      confirmedEventId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'events', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      cancellationReason: {
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

    await queryInterface.addIndex('event_requests', ['locationId', 'status'])
    await queryInterface.addIndex('event_requests', ['residentId'])
    await queryInterface.addIndex('event_requests', ['venueId'])
  } else {
    // 6. Partial local apply: idempotently add missing final columns / remap status ENUM
    const desc = await queryInterface.describeTable('event_requests')

    if (!desc.schedule) {
      await queryInterface.addColumn('event_requests', 'schedule', {
        type: DataTypes.JSON,
        allowNull: true,
      })
    }

    if (!desc.selectedServices) {
      await queryInterface.addColumn('event_requests', 'selectedServices', {
        type: DataTypes.JSON,
        allowNull: true,
      })
    }

    if (!desc.requestNumber) {
      await queryInterface.addColumn('event_requests', 'requestNumber', {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
      })
    }

    if (!desc.meetingScheduledAt) {
      await queryInterface.addColumn('event_requests', 'meetingScheduledAt', {
        type: DataTypes.DATE,
        allowNull: true,
      })
    }

    if (!desc.confirmedEventId) {
      await queryInterface.addColumn('event_requests', 'confirmedEventId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'events', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      })
    }

    if (!desc.cancellationReason) {
      await queryInterface.addColumn('event_requests', 'cancellationReason', {
        type: DataTypes.TEXT,
        allowNull: true,
      })
    }

    // Remap legacy PENDING/REVIEWED/APPROVED status values to final ENUM if present
    await queryInterface.sequelize.query(`
      ALTER TABLE \`event_requests\`
      MODIFY COLUMN \`status\` ENUM(
        'PENDING', 'REVIEWED', 'APPROVED', 'REJECTED', 'CANCELLED',
        'OPEN', 'IN_PROGRESS', 'CLOSED'
      ) NOT NULL DEFAULT 'PENDING'
    `)

    await queryInterface.sequelize.query(`
      UPDATE \`event_requests\` SET \`status\` = 'OPEN' WHERE \`status\` = 'PENDING'
    `)
    await queryInterface.sequelize.query(`
      UPDATE \`event_requests\` SET \`status\` = 'IN_PROGRESS' WHERE \`status\` = 'REVIEWED'
    `)
    await queryInterface.sequelize.query(`
      UPDATE \`event_requests\` SET \`status\` = 'CLOSED' WHERE \`status\` = 'APPROVED'
    `)

    await queryInterface.sequelize.query(`
      ALTER TABLE \`event_requests\`
      MODIFY COLUMN \`status\` ENUM(
        'OPEN', 'IN_PROGRESS', 'CLOSED', 'REJECTED', 'CANCELLED'
      ) NOT NULL DEFAULT 'OPEN'
    `)
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = listTables(await queryInterface.showAllTables())

  if (tables.includes('event_requests')) {
    await queryInterface.dropTable('event_requests')
  }

  if (tables.includes('event_registrations')) {
    const regsDesc = await queryInterface.describeTable('event_registrations')
    if (regsDesc.seatCount) {
      await queryInterface.removeColumn('event_registrations', 'seatCount')
    }
  }

  if (tables.includes('events')) {
    const eventsDesc = await queryInterface.describeTable('events')
    if (eventsDesc.occupancy) {
      await queryInterface.removeColumn('events', 'occupancy')
    }
    if (eventsDesc.description) {
      await queryInterface.changeColumn('events', 'description', {
        type: DataTypes.TEXT,
        allowNull: false,
      })
    }

    // Restore legacy venues FK if present pattern matches prior down
    const [constraints] = (await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'events'
        AND COLUMN_NAME = 'venueId'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `)) as [Array<{ CONSTRAINT_NAME: string; REFERENCED_TABLE_NAME: string }>, unknown]

    let hasVenuesFk = false

    for (const constraint of constraints) {
      if (constraint.REFERENCED_TABLE_NAME === 'venues') {
        hasVenuesFk = true
        continue
      }
      await queryInterface.removeConstraint('events', constraint.CONSTRAINT_NAME)
    }

    if (!hasVenuesFk && tables.includes('venues')) {
      await queryInterface.addConstraint('events', {
        fields: ['venueId'],
        type: 'foreign key',
        name: 'events_ibfk_1',
        references: {
          table: 'venues',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      })
    }
  }
}
