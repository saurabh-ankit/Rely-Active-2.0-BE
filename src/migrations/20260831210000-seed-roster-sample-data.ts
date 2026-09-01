import { type QueryInterface } from 'sequelize'
import { randomUUID } from 'node:crypto'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const now = new Date()

  // Look up existing company or insert fallback
  const rawCompany = await queryInterface.rawSelect('company', {}, ['id'])
  let defaultCompanyId = rawCompany ? String(rawCompany) : null

  if (!defaultCompanyId) {
    defaultCompanyId = randomUUID()
    await queryInterface.bulkInsert('company', [
      {
        id: defaultCompanyId,
        company_name: 'Default Rely Healthcare Services',
        email_id: 'admin@rely.com',
        contact_number: '9999999999',
        company_head_office_address: 'Rely Headquarters',
        isActive: true,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  // Look up existing property or insert fallback
  const rawProperty = await queryInterface.rawSelect('properties', {}, ['id'])
  let defaultLocationId = rawProperty ? String(rawProperty) : null

  if (!defaultLocationId) {
    defaultLocationId = randomUUID()
    await queryInterface.bulkInsert('properties', [
      {
        id: defaultLocationId,
        companyId: defaultCompanyId,
        property_name: 'Rely Primary Care Facility',
        property_type: 'apartment',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
        isActive: true,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  // ── 1. Seed Shift Templates ───────────────────────────────────────────────
  const shiftsData = [
    {
      id: randomUUID(),
      companyId: defaultCompanyId,
      locationId: defaultLocationId,
      shiftName: 'Morning Shift',
      code: 'SHIFT_MORNING',
      description: 'Standard Morning Shift for Nurses & Operational Staff',
      startTime: '07:00:00',
      endTime: '15:00:00',
      breakStartTime: '12:00:00',
      breakEndTime: '13:00:00',
      slotGenerationMode: 'AUTO_GENERATE',
      slotDurationMinutes: 60,
      numberOfSlots: 8,
      status: 'ACTIVE',
      isDeleted: false,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      companyId: defaultCompanyId,
      locationId: defaultLocationId,
      shiftName: 'Evening Shift',
      code: 'SHIFT_EVENING',
      description: 'Standard Evening Shift for Operational Staff',
      startTime: '15:00:00',
      endTime: '23:00:00',
      breakStartTime: '19:00:00',
      breakEndTime: '20:00:00',
      slotGenerationMode: 'AUTO_GENERATE',
      slotDurationMinutes: 60,
      numberOfSlots: 8,
      status: 'ACTIVE',
      isDeleted: false,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      companyId: defaultCompanyId,
      locationId: defaultLocationId,
      shiftName: 'Night Duty Shift',
      code: 'SHIFT_NIGHT',
      description: 'Overnight Shift requiring mandatory 11h rest period before next shift',
      startTime: '23:00:00',
      endTime: '07:00:00',
      breakStartTime: '03:00:00',
      breakEndTime: '04:00:00',
      slotGenerationMode: 'AUTO_GENERATE',
      slotDurationMinutes: 60,
      numberOfSlots: 8,
      status: 'ACTIVE',
      isDeleted: false,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      companyId: defaultCompanyId,
      locationId: defaultLocationId,
      shiftName: 'Visiting Doctor OPD Slot',
      code: 'SHIFT_OPD_VISITING',
      description: 'Specialty consultation OPD slot for Visiting Specialists',
      startTime: '10:00:00',
      endTime: '13:00:00',
      breakStartTime: null,
      breakEndTime: null,
      slotGenerationMode: 'AUTO_GENERATE',
      slotDurationMinutes: 30,
      numberOfSlots: 6,
      status: 'ACTIVE',
      isDeleted: false,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
  ]

  for (const shift of shiftsData) {
    const existing = await queryInterface.rawSelect('roster_shifts', { where: { code: shift.code } }, ['id'])
    if (!existing) {
      await queryInterface.bulkInsert('roster_shifts', [shift])
    }
  }

  // ── 2. Seed Frequency Rules ───────────────────────────────────────────────
  const frequenciesData = [
    {
      id: randomUUID(),
      companyId: defaultCompanyId,
      locationId: defaultLocationId,
      frequencyName: 'Daily Continuous',
      frequencyType: 'DAILY',
      interval: 1,
      timeUnit: 'DAYS',
      allowedDaysOfWeek: null,
      monthlyDays: null,
      description: 'Repeats every single day',
      status: 'ACTIVE',
      isDeleted: false,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      companyId: defaultCompanyId,
      locationId: defaultLocationId,
      frequencyName: 'Standard 5-Day Week',
      frequencyType: 'WEEKLY',
      interval: 1,
      timeUnit: 'WEEKS',
      allowedDaysOfWeek: JSON.stringify([1, 2, 3, 4, 5]),
      monthlyDays: null,
      description: 'Repeats Monday through Friday',
      status: 'ACTIVE',
      isDeleted: false,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      companyId: defaultCompanyId,
      locationId: defaultLocationId,
      frequencyName: 'Bi-Weekly OPD Schedule',
      frequencyType: 'BI_WEEKLY',
      interval: 2,
      timeUnit: 'WEEKS',
      allowedDaysOfWeek: JSON.stringify([2, 4]),
      monthlyDays: null,
      description: 'Every alternate Tuesday and Thursday',
      status: 'ACTIVE',
      isDeleted: false,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
  ]

  for (const freq of frequenciesData) {
    const existing = await queryInterface.rawSelect(
      'roster_frequencies',
      { where: { frequencyName: freq.frequencyName } },
      ['id'],
    )
    if (!existing) {
      await queryInterface.bulkInsert('roster_frequencies', [freq])
    }
  }

  // ── 3. Seed Default Location Roster Setting ────────────────────────────────
  const existingSetting = await queryInterface.rawSelect(
    'roster_settings',
    { where: { locationId: defaultLocationId } },
    ['id'],
  )
  if (!existingSetting) {
    await queryInterface.bulkInsert('roster_settings', [
      {
        id: randomUUID(),
        companyId: defaultCompanyId,
        locationId: defaultLocationId,
        preShiftBufferMinutes: 60,
        postShiftBufferMinutes: 120,
        minRestPeriodHours: 11,
        maxWeeklyHours: 48,
        minMultiPropertyTravelMinutes: 60,
        isDeleted: false,
        createdBy: 'system',
        updatedBy: 'system',
        createdAt: now,
        updatedAt: now,
      },
    ])
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawCompany = await queryInterface.rawSelect('company', {}, ['id'])
  if (rawCompany) {
    const companyId = String(rawCompany)
    await queryInterface.bulkDelete('roster_settings', { companyId })
    await queryInterface.bulkDelete('roster_frequencies', { companyId })
    await queryInterface.bulkDelete('roster_shifts', { companyId })
  }
}
