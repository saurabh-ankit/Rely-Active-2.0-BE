import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('events')

  if (!tableDescription.maxCapacity) {
    await queryInterface.addColumn('events', 'maxCapacity', {
      type: DataTypes.INTEGER,
      allowNull: true,
    })
  }

  if (!tableDescription.reservationPerFlat) {
    await queryInterface.addColumn('events', 'reservationPerFlat', {
      type: DataTypes.INTEGER,
      allowNull: true,
    })
  }

  if (!tableDescription.recurrenceDayOfWeek) {
    await queryInterface.addColumn('events', 'recurrenceDayOfWeek', {
      type: DataTypes.TINYINT,
      allowNull: true,
    })
  }

  if (!tableDescription.recurrenceDayOfMonth) {
    await queryInterface.addColumn('events', 'recurrenceDayOfMonth', {
      type: DataTypes.TINYINT,
      allowNull: true,
    })
  }

  if (!tableDescription.recurrenceMonth) {
    await queryInterface.addColumn('events', 'recurrenceMonth', {
      type: DataTypes.TINYINT,
      allowNull: true,
    })
  }

  // Expand enum to include new values before migrating data
  await queryInterface.changeColumn('events', 'eventType', {
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
      'regular',
      'special',
    ),
    allowNull: false,
  })

  await queryInterface.sequelize.query(`
  UPDATE events
  SET eventType = CASE
    WHEN frequencyType = 'once' THEN 'special'
    ELSE 'regular'
  END
  WHERE eventType NOT IN ('regular', 'special')
  `)

  await queryInterface.changeColumn('events', 'eventType', {
    type: DataTypes.ENUM('regular', 'special'),
    allowNull: false,
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = await queryInterface.describeTable('events')

  await queryInterface.changeColumn('events', 'eventType', {
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
      'regular',
      'special',
    ),
    allowNull: false,
  })

  await queryInterface.sequelize.query(`
  UPDATE events SET eventType = 'other' WHERE eventType IN ('regular', 'special')
  `)

  await queryInterface.changeColumn('events', 'eventType', {
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
  })

  if (tableDescription.recurrenceMonth) {
    await queryInterface.removeColumn('events', 'recurrenceMonth')
  }
  if (tableDescription.recurrenceDayOfMonth) {
    await queryInterface.removeColumn('events', 'recurrenceDayOfMonth')
  }
  if (tableDescription.recurrenceDayOfWeek) {
    await queryInterface.removeColumn('events', 'recurrenceDayOfWeek')
  }
  if (tableDescription.reservationPerFlat) {
    await queryInterface.removeColumn('events', 'reservationPerFlat')
  }
  if (tableDescription.maxCapacity) {
    await queryInterface.removeColumn('events', 'maxCapacity')
  }
}
