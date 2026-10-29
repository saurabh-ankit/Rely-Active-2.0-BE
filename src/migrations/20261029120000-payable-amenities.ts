import { DataTypes, type QueryInterface } from 'sequelize'

const SERVICE_TYPES_BEFORE = [
  'RENT',
  'CARE_PACKAGE',
  'FOOD_PACKAGE',
  'FOOD_ORDER',
  'ADDITIONAL_TASK',
  'DOCTOR_CONSULTATION',
  'LAB_TEST',
  'INVENTORY_ITEM',
  'EVENT_FEE',
  'VENUE_BOOKING',
  'MAINTENANCE',
  'MISCELLANEOUS_AS_SERVICE',
  'MISCELLANEOUS_AT_BILLING',
  'CARRY_FORWARD',
]
const SERVICE_TYPES_AFTER = [...SERVICE_TYPES_BEFORE, 'AMENITY_BOOKING']

/**
 * Payable amenities: a price on the property's amenity, captured on each booking and billed to the flat.
 * Booking units: timed slots, whole days, or overnight stays (check-in → check-out). A day or stay booking
 * covers a range of dates, so bookings get an end date and a unit count.
 */
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const amenityCols = await queryInterface.describeTable('property_amenities')
  if (!amenityCols.isPayable) {
    await queryInterface.addColumn('property_amenities', 'isPayable', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }
  if (!amenityCols.price) {
    await queryInterface.addColumn('property_amenities', 'price', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Price per booked slot / day / night when the amenity is payable',
    })
  }

  const bookingCols = await queryInterface.describeTable('amenity_slot_bookings')
  if (!bookingCols.chargeAmount) {
    await queryInterface.addColumn('amenity_slot_bookings', 'chargeAmount', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "The amenity's price when booked; billed on the flat's invoice",
    })
  }

  await queryInterface.changeColumn('services_invoice', 'serviceType', {
    type: DataTypes.ENUM(...SERVICE_TYPES_AFTER),
    allowNull: false,
  })

  const configCols = await queryInterface.describeTable('amenity_slot_configs')
  if (!configCols.bookingUnit) {
    await queryInterface.addColumn('amenity_slot_configs', 'bookingUnit', {
      type: DataTypes.ENUM('SLOT', 'FULL_DAY', 'NIGHT'),
      allowNull: false,
      defaultValue: 'SLOT',
    })
  }
  if (!configCols.checkOutMinutes) {
    await queryInterface.addColumn('amenity_slot_configs', 'checkOutMinutes', {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'NIGHT only: check-out time on the day after each night',
    })
  }

  const unitBookingCols = await queryInterface.describeTable('amenity_slot_bookings')
  if (!unitBookingCols.endDate) {
    await queryInterface.addColumn('amenity_slot_bookings', 'endDate', {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Last date the booking occupies (inclusive); null means the start date only',
    })
  }
  if (!unitBookingCols.endMinutes) {
    await queryInterface.addColumn('amenity_slot_bookings', 'endMinutes', {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Slot end, or check-out time for a stay, as booked',
    })
  }
  if (!unitBookingCols.unitCount) {
    await queryInterface.addColumn('amenity_slot_bookings', 'unitCount', {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Slots, days or nights booked',
    })
  }
  if (!unitBookingCols.unitPrice) {
    await queryInterface.addColumn('amenity_slot_bookings', 'unitPrice', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Price per slot / day / night when booked; chargeAmount = unitPrice × unitCount',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // Invoices with amenity lines can't lose that type without losing billed data.
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS n FROM services_invoice WHERE serviceType = 'AMENITY_BOOKING'`,
  )
  if (Number((rows as { n: number }[])[0]?.n) > 0) {
    throw new Error('Invoices already contain amenity booking lines; remove them before rolling back')
  }
  const unitBookingCols = await queryInterface.describeTable('amenity_slot_bookings')
  for (const col of ['unitPrice', 'unitCount', 'endMinutes', 'endDate']) {
    if (unitBookingCols[col]) await queryInterface.removeColumn('amenity_slot_bookings', col)
  }
  const configCols = await queryInterface.describeTable('amenity_slot_configs')
  if (configCols.checkOutMinutes) await queryInterface.removeColumn('amenity_slot_configs', 'checkOutMinutes')
  if (configCols.bookingUnit) await queryInterface.removeColumn('amenity_slot_configs', 'bookingUnit')
  await queryInterface.changeColumn('services_invoice', 'serviceType', {
    type: DataTypes.ENUM(...SERVICE_TYPES_BEFORE),
    allowNull: false,
  })
  const bookingCols = await queryInterface.describeTable('amenity_slot_bookings')
  if (bookingCols.chargeAmount) await queryInterface.removeColumn('amenity_slot_bookings', 'chargeAmount')
  const amenityCols = await queryInterface.describeTable('property_amenities')
  if (amenityCols.price) await queryInterface.removeColumn('property_amenities', 'price')
  if (amenityCols.isPayable) await queryInterface.removeColumn('property_amenities', 'isPayable')
}
