import { type QueryInterface } from 'sequelize'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const now = new Date()

  // ── 1. Roles ───────────────────────────────────────────────────────────────
  const rolesData = [
    {
      id: randomUUID(),
      name: 'Super Admin',
      code: 'SUPER_ADMIN',
      description: 'Platform-level administrator with full system access',
      isSystem: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'Property Admin',
      code: 'ADMIN',
      description: 'Property-level administrator',
      isSystem: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'Department Manager',
      code: 'MANAGER',
      description: 'Department-level manager',
      isSystem: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'Operational Staff',
      code: 'EMPLOYEE',
      description: 'Operational staff member',
      isSystem: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'Doctor',
      code: 'DOCTOR',
      description: 'Medical practitioner',
      isSystem: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'Nurse',
      code: 'NURSE',
      description: 'Nursing staff member',
      isSystem: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'Caretaker',
      code: 'CARETAKER',
      description: 'Assigned resident caretaker',
      isSystem: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'Vendor',
      code: 'VENDOR',
      description: 'External contractor',
      isSystem: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ]

  for (const r of rolesData) {
    const existing = await queryInterface.rawSelect('roles', { where: { code: r.code } }, ['id'])
    if (!existing) {
      await queryInterface.bulkInsert('roles', [r])
    }
  }

  // ── 2. Resources (Modules) ──────────────────────────────────────────────────
  const resourcesData = [
    {
      id: randomUUID(),
      key: 'FNB',
      name: 'Food',
      description: 'Food & Beverage dining and orders',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'RESIDENT',
      name: 'Resident',
      description: 'Resident management & directory',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'EMPLOYEE',
      name: 'Employee',
      description: 'Employee directory & staff profiles',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'ROSTER',
      name: 'Shift & Roster',
      description: 'Shift & roster schedules',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'TICKETS',
      name: 'Ticket Management',
      description: 'Repair & Maintenance, Concierge, Housekeeping, Food Tickets',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'GNS',
      name: 'Gate & Security',
      description: 'Gate passes, visitor check-ins & security scans',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'INVENTORY',
      name: 'Inventory',
      description: 'Inventory & stock management',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'ASSET',
      name: 'Asset Management',
      description: 'Asset tracking & maintenance',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'MEDICAL',
      name: 'Medical',
      description: 'Medical dashboard, care tasks & records',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'BILLING',
      name: 'Billing',
      description: 'Invoices, payments & ledgers',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      key: 'EVENTS',
      name: 'Events',
      description: 'Community events & activities',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
  ]

  for (const resItem of resourcesData) {
    const existing = await queryInterface.rawSelect('resources', { where: { key: resItem.key } }, ['id'])
    if (!existing) {
      await queryInterface.bulkInsert('resources', [resItem])
    }
  }

  // ── 3. Departments ─────────────────────────────────────────────────────────
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
      code: 'MED',
      name: 'Medical',
      description: 'Medical & Healthcare Services',
      isActive: true,
    },
  ]

  // Hard delete job categories of obsolete departments first to prevent foreign key errors
  await queryInterface.sequelize.query(
    `DELETE FROM job_categories WHERE departmentId IN (SELECT id FROM departments WHERE code IN ('NUR', 'DOC', 'ADM', 'ATT', 'FIN'))`,
  )

  // Hard delete obsolete departments
  await queryInterface.sequelize.query(`DELETE FROM departments WHERE code IN ('NUR', 'DOC', 'ADM', 'ATT', 'FIN')`)

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

  // ── 4. Job Categories ──────────────────────────────────────────────────────
  const jobCategoriesData = [
    // Repair & Maintenance (RNM)
    { departmentCode: 'RNM', code: 'RNM_ELEC', name: 'Electrical', description: 'Electrical maintenance & repairs' },
    { departmentCode: 'RNM', code: 'RNM_CARP', name: 'Carpentry', description: 'Carpentry & woodwork maintenance' },
    { departmentCode: 'RNM', code: 'RNM_PLUM', name: 'Plumbing', description: 'Plumbing maintenance & repairs' },
    { departmentCode: 'RNM', code: 'RNM_MISC', name: 'Miscellaneous', description: 'General & miscellaneous repairs' },

    // Concierge (CON)
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

    // Food & Beverage (FNB) - ONLY F&B Operations
    { departmentCode: 'FNB', code: 'FNB_OPS', name: 'F&B Operations', description: 'Food & Beverage Operations' },

    // Housekeeping (HK) - ONLY Housekeeping Operations
    { departmentCode: 'HK', code: 'HK_OPS', name: 'Housekeeping Operations', description: 'Housekeeping Operations' },

    // Events (EVT) - ONLY Event Operations
    { departmentCode: 'EVT', code: 'EVT_OPS', name: 'Event Operations', description: 'Event Operations' },

    // Medical (MED)
    { departmentCode: 'MED', code: 'MED_INHOUSE', name: 'Inhouse', description: 'In-house Medical Staff' },
    { departmentCode: 'MED', code: 'MED_VISITING', name: 'Visiting', description: 'Visiting Medical Staff' },
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

  // Hard delete obsolete job categories
  const obsoleteJobCatNames = [
    'Civil Maintenance',
    'General Maintenance',
    'HVAC',
    'Biomedical Equipment',
    'Front Desk',
    'Resident Services',
    'Guest Services',
    'Event Planning',
    'Community Activities',
    'Recreation',
    'Entertainment',
    'Catering',
    'Nutrition & Dietary',
    'Food Production',
    'Food Service',
    'Kitchen Operations',
    'Stewarding',
    'Chef & Kitchen Staff',
    'Dining Service Staff',
    'F&B Manager / Supervisor',
    'Meal Delivery Executive',
    'Cleaning Services',
    'Room Attendant',
    'Laundry Services',
    'Waste Management',
    'Housekeeper / Cleaner',
    'Housekeeping Supervisor',
    'Linen & Laundry Attendant',
  ]

  await queryInterface.sequelize.query(
    `DELETE FROM job_categories
     WHERE name IN (:obsoleteJobCatNames)
        OR code LIKE 'DOC_%'
        OR code LIKE 'NUR_%'`,
    {
      replacements: {
        obsoleteJobCatNames,
      },
    },
  )

  // Hard delete obsolete department job categories for SEC, EVT, FNB, HK
  const deptCleanupItems: Array<{ deptCode: string; allowedCode: string; allowedName: string }> = [
    { deptCode: 'SEC', allowedCode: 'SEC_VISITOR', allowedName: 'Visitor Management' },
    { deptCode: 'EVT', allowedCode: 'EVT_OPS', allowedName: 'Event Operations' },
    { deptCode: 'FNB', allowedCode: 'FNB_OPS', allowedName: 'F&B Operations' },
    { deptCode: 'HK', allowedCode: 'HK_OPS', allowedName: 'Housekeeping Operations' },
  ]

  for (const item of deptCleanupItems) {
    const deptId = deptIdMap[item.deptCode]
    if (deptId) {
      await queryInterface.sequelize.query(
        `DELETE FROM job_categories
         WHERE departmentId = :departmentId
           AND code != :allowedCode
           AND name != :allowedName`,
        {
          replacements: {
            departmentId: deptId,
            allowedCode: item.allowedCode,
            allowedName: item.allowedName,
          },
        },
      )
    }
  }

  // ── 5. Super Admin User ─────────────────────────────────────────────────────
  const superAdminEmail = 'superadmin@rely.com'
  const hashedPassword = bcrypt.hashSync('SuperAdmin@123', 10)

  const existingUser = await queryInterface.rawSelect('users', { where: { email: superAdminEmail } }, ['id'])
  let superAdminId = existingUser ? String(existingUser) : null

  if (!superAdminId) {
    superAdminId = randomUUID()
    await queryInterface.bulkInsert('users', [
      {
        id: superAdminId,
        username: 'superadmin',
        email: superAdminEmail,
        phone: '9999999999',
        passwordHash: hashedPassword,
        status: 'ACTIVE',
        isActive: true,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  const profileExisting = await queryInterface.rawSelect('user_details', { where: { userId: superAdminId } }, ['id'])
  if (!profileExisting) {
    await queryInterface.bulkInsert('user_details', [
      {
        id: randomUUID(),
        userId: superAdminId,
        firstName: 'Super',
        lastName: 'Admin',
        phone: '9999999999',
        dateOfJoining: '2026-08-28',
        employeeCode: 'EMP-20260828-0001',
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  const existingRole = await queryInterface.rawSelect('roles', { where: { code: 'SUPER_ADMIN' } }, ['id'])
  const superAdminRoleId = existingRole ? String(existingRole) : null

  if (superAdminRoleId) {
    const defaultLocId = '00000000-0000-0000-0000-000000000000'
    const userLocExisting = await queryInterface.rawSelect(
      'user_locations',
      { where: { userId: superAdminId, roleId: superAdminRoleId } },
      ['id'],
    )
    if (!userLocExisting) {
      await queryInterface.bulkInsert('user_locations', [
        {
          id: randomUUID(),
          userId: superAdminId,
          locId: defaultLocId,
          roleId: superAdminRoleId,
          isActive: true,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        },
      ])
    }
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const superAdminEmail = 'superadmin@rely.com'
  const existingUser = await queryInterface.rawSelect('users', { where: { email: superAdminEmail } }, ['id'])
  const superAdminId = existingUser ? String(existingUser) : null

  if (superAdminId) {
    await queryInterface.bulkDelete('user_locations', { userId: superAdminId })
    await queryInterface.bulkDelete('user_details', { userId: superAdminId })
    await queryInterface.bulkDelete('users', { id: superAdminId })
  }
}
