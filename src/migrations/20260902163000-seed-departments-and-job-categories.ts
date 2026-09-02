import { type QueryInterface } from 'sequelize'
import { randomUUID } from 'node:crypto'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const now = new Date()

  // ── 1. Departments Data ──────────────────────────────────────────────────
  const departmentsData = [
    {
      code: 'RNM',
      name: 'Repair & Maintenance',
      description: 'Maintenance & engineering services',
      isActive: true,
    },
    {
      code: 'CON',
      name: 'Concierge',
      description: 'Front desk & resident services',
      isActive: true,
    },
    {
      code: 'FNB',
      name: 'Food & Beverage',
      description: 'Dining, kitchen & catering',
      isActive: true,
    },
    {
      code: 'EVT',
      name: 'Events',
      description: 'Community events & activities',
      isActive: true,
    },
    {
      code: 'SEC',
      name: 'Gate & Security',
      description: 'Security guards & entry control',
      isActive: true,
    },
    {
      code: 'HK',
      name: 'Housekeeping',
      description: 'Cleaning & facilities upkeep',
      isActive: true,
    },
    {
      code: 'NUR',
      name: 'Nursing',
      description: 'Healthcare & nursing staff',
      isActive: true,
    },
    {
      code: 'DOC',
      name: 'Medical / Doctor',
      description: 'Doctors & health practitioners',
      isActive: true,
    },
    {
      code: 'ATT',
      name: 'Attendance & Workforce',
      description: 'Workforce management',
      isActive: true,
    },
  ]

  // Map to hold department code -> UUID
  const deptIdMap: Record<string, string> = {}

  for (const dept of departmentsData) {
    const [existingRows] = (await queryInterface.sequelize.query(
      `SELECT id FROM departments WHERE code = :code LIMIT 1`,
      { replacements: { code: dept.code } },
    )) as [Array<{ id: string }>, unknown]

    const existingId = existingRows?.[0]?.id

    if (existingId) {
      deptIdMap[dept.code] = existingId
      await queryInterface.sequelize.query(
        `UPDATE departments SET name = :name, description = :description, isActive = true, updatedAt = :updatedAt WHERE id = :id`,
        {
          replacements: {
            id: existingId,
            name: dept.name,
            description: dept.description,
            updatedAt: now,
          },
        },
      )
    } else {
      const newId = randomUUID()
      deptIdMap[dept.code] = newId
      await queryInterface.sequelize.query(
        `INSERT INTO departments (id, code, name, description, isActive, createdAt, updatedAt)
         VALUES (:id, :code, :name, :description, true, :createdAt, :updatedAt)`,
        {
          replacements: {
            id: newId,
            code: dept.code,
            name: dept.name,
            description: dept.description,
            createdAt: now,
            updatedAt: now,
          },
        },
      )
    }
  }

  // ── 2. Job Categories Data ───────────────────────────────────────────────
  const jobCategoriesData = [
    // Repair & Maintenance (RNM) - 4 primary categories
    { departmentCode: 'RNM', code: 'RNM_ELEC', name: 'Electrical', description: 'Electrical maintenance & repairs' },
    { departmentCode: 'RNM', code: 'RNM_CARP', name: 'Carpentry', description: 'Carpentry & woodwork maintenance' },
    { departmentCode: 'RNM', code: 'RNM_PLUM', name: 'Plumbing', description: 'Plumbing maintenance & repairs' },
    { departmentCode: 'RNM', code: 'RNM_MISC', name: 'Miscellaneous', description: 'General & miscellaneous repairs' },

    // Concierge (CON) - 5 primary categories
    { departmentCode: 'CON', code: 'CON_HK', name: 'Housekeeping', description: 'Housekeeping & cleaning services' },
    { departmentCode: 'CON', code: 'CON_LAUNDRY', name: 'Laundry', description: 'Laundry & linen services' },
    {
      departmentCode: 'CON',
      code: 'CON_SUPPORT',
      name: 'Customer Support',
      description: 'Customer support & resident helpdesk',
    },
    {
      departmentCode: 'CON',
      code: 'CON_TRANS',
      name: 'Transportation',
      description: 'Transportation & shuttle services',
    },
    { departmentCode: 'CON', code: 'CON_OTHERS', name: 'Others', description: 'Other concierge services' },

    // Gate & Security (SEC) - ONLY Visitor Management
    {
      departmentCode: 'SEC',
      code: 'SEC_VISITOR',
      name: 'Visitor Management',
      description: 'Visitor management & gate entry',
    },

    // Food & Beverage (FNB)
    { departmentCode: 'FNB', code: 'FNB_KITCHEN', name: 'Kitchen Operations', description: 'Kitchen Operations' },
    { departmentCode: 'FNB', code: 'FNB_PROD', name: 'Food Production', description: 'Food Production' },
    { departmentCode: 'FNB', code: 'FNB_SERVICE', name: 'Food Service', description: 'Food Service' },
    { departmentCode: 'FNB', code: 'FNB_CATERING', name: 'Catering', description: 'Catering' },
    { departmentCode: 'FNB', code: 'FNB_STEWARD', name: 'Stewarding', description: 'Stewarding' },
    { departmentCode: 'FNB', code: 'FNB_NUTRITION', name: 'Nutrition & Dietary', description: 'Nutrition & Dietary' },

    // Housekeeping (HK)
    { departmentCode: 'HK', code: 'HK_OPS', name: 'Housekeeping Operations', description: 'Housekeeping Operations' },
    { departmentCode: 'HK', code: 'HK_CLEAN', name: 'Cleaning Services', description: 'Cleaning Services' },
    { departmentCode: 'HK', code: 'HK_LAUNDRY', name: 'Laundry Services', description: 'Laundry Services' },
    { departmentCode: 'HK', code: 'HK_WASTE', name: 'Waste Management', description: 'Waste Management' },
    { departmentCode: 'HK', code: 'HK_ATTENDANT', name: 'Room Attendant', description: 'Room Attendant' },

    // Events (EVT)
    { departmentCode: 'EVT', code: 'EVT_PLANNING', name: 'Event Planning', description: 'Event Planning' },
    { departmentCode: 'EVT', code: 'EVT_OPS', name: 'Event Operations', description: 'Event Operations' },
    { departmentCode: 'EVT', code: 'EVT_COMMUNITY', name: 'Community Activities', description: 'Community Activities' },
    { departmentCode: 'EVT', code: 'EVT_REC', name: 'Recreation', description: 'Recreation' },
    { departmentCode: 'EVT', code: 'EVT_ENTERTAIN', name: 'Entertainment', description: 'Entertainment' },

    // Nursing (NUR)
    { departmentCode: 'NUR', code: 'NUR_OPS', name: 'Nursing Operations', description: 'Nursing Operations' },
    { departmentCode: 'NUR', code: 'NUR_CLINICAL', name: 'Clinical Nursing', description: 'Clinical Nursing' },
    { departmentCode: 'NUR', code: 'NUR_PATIENT_CARE', name: 'Patient Care', description: 'Patient Care' },
    { departmentCode: 'NUR', code: 'NUR_ADMIN', name: 'Nursing Administration', description: 'Nursing Administration' },

    // Medical / Doctor (DOC)
    { departmentCode: 'DOC', code: 'DOC_CLINICAL', name: 'Clinical Services', description: 'Clinical Services' },
    { departmentCode: 'DOC', code: 'DOC_EMERGENCY', name: 'Emergency Care', description: 'Emergency Care' },
    { departmentCode: 'DOC', code: 'DOC_SPEC', name: 'Specialist Medicine', description: 'Specialist Medicine' },
    { departmentCode: 'DOC', code: 'DOC_GEN', name: 'General Medicine', description: 'General Medicine' },
    { departmentCode: 'DOC', code: 'DOC_DIAG', name: 'Diagnostics', description: 'Diagnostics' },

    // Attendance & Workforce (ATT)
    { departmentCode: 'ATT', code: 'ATT_MGMT', name: 'Attendance Management', description: 'Attendance Management' },
    { departmentCode: 'ATT', code: 'ATT_WORKFORCE', name: 'Workforce Planning', description: 'Workforce Planning' },
    { departmentCode: 'ATT', code: 'ATT_HROPS', name: 'HR Operations', description: 'HR Operations' },
    { departmentCode: 'ATT', code: 'ATT_PAYROLL', name: 'Payroll & Timekeeping', description: 'Payroll & Timekeeping' },
  ]

  for (const jc of jobCategoriesData) {
    const deptId = deptIdMap[jc.departmentCode]
    if (!deptId) continue

    const [existingRows] = (await queryInterface.sequelize.query(
      `SELECT id FROM job_categories WHERE code = :code LIMIT 1`,
      { replacements: { code: jc.code } },
    )) as [Array<{ id: string }>, unknown]

    const existingId = existingRows?.[0]?.id

    if (existingId) {
      await queryInterface.sequelize.query(
        `UPDATE job_categories
         SET departmentId = :departmentId, name = :name, description = :description, isActive = true, updatedAt = :updatedAt
         WHERE id = :id`,
        {
          replacements: {
            id: existingId,
            departmentId: deptId,
            name: jc.name,
            description: jc.description,
            updatedAt: now,
          },
        },
      )
    } else {
      const newId = randomUUID()
      await queryInterface.sequelize.query(
        `INSERT INTO job_categories (id, departmentId, code, name, description, isActive, createdAt, updatedAt)
         VALUES (:id, :departmentId, :code, :name, :description, true, :createdAt, :updatedAt)`,
        {
          replacements: {
            id: newId,
            departmentId: deptId,
            code: jc.code,
            name: jc.name,
            description: jc.description,
            createdAt: now,
            updatedAt: now,
          },
        },
      )
    }
  }

  // ── 3. Deactivate obsolete Gate & Security (SEC) job categories ──────────
  const secDeptId = deptIdMap['SEC']
  if (secDeptId) {
    await queryInterface.sequelize.query(
      `UPDATE job_categories
       SET isActive = false, updatedAt = :updatedAt
       WHERE departmentId = :departmentId
         AND code != 'SEC_VISITOR'
         AND name != 'Visitor Management'`,
      {
        replacements: {
          departmentId: secDeptId,
          updatedAt: now,
        },
      },
    )
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // Safe rollback: Reactivate any standard SEC categories if needed
  await queryInterface.sequelize.query(
    `UPDATE job_categories SET isActive = true WHERE departmentId IN (SELECT id FROM departments WHERE code = 'SEC')`,
  )
}
