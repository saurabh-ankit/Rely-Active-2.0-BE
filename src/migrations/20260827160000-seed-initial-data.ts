import { type QueryInterface } from 'sequelize'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const now = new Date()

  // ── 0. System Company & Property ───────────────────────────────────────────
  const defaultId = '00000000-0000-0000-0000-000000000000'

  const existingCompany = await queryInterface.rawSelect('company', { where: { id: defaultId } }, ['id'])
  if (!existingCompany) {
    await queryInterface.bulkInsert('company', [
      {
        id: defaultId,
        company_name: 'System Default Company',
        email_id: 'admin@system.local',
        contact_number: '0000000000',
        company_head_office_address: 'System',
        isActive: true,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  const existingProperty = await queryInterface.rawSelect('properties', { where: { id: defaultId } }, ['id'])
  if (!existingProperty) {
    await queryInterface.bulkInsert('properties', [
      {
        id: defaultId,
        companyId: defaultId,
        property_name: 'System Default Property',
        property_type: 'apartment',
        city: 'System',
        state: 'System',
        pincode: '000000',
        country: 'System',
        isActive: true,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

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
      name: 'Resident',
      code: 'RESIDENT',
      description: 'Resident / occupant',
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
      id: randomUUID(),
      code: 'RNM',
      name: 'Repair & Maintenance',
      description: 'Maintenance & engineering services',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      code: 'CON',
      name: 'Concierge',
      description: 'Front desk & resident services',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      code: 'FNB',
      name: 'Food & Beverage',
      description: 'Dining, kitchen & catering',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      code: 'EVT',
      name: 'Events',
      description: 'Community events & activities',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      code: 'SEC',
      name: 'Gate & Security',
      description: 'Security guards & entry control',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      code: 'HK',
      name: 'Housekeeping',
      description: 'Cleaning & facilities upkeep',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      code: 'NUR',
      name: 'Nursing',
      description: 'Healthcare & nursing staff',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      code: 'DOC',
      name: 'Medical / Doctor',
      description: 'Doctors & health practitioners',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      code: 'ATT',
      name: 'Attendance & Workforce',
      description: 'Workforce management',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const deptMap: Record<string, string> = {}
  for (const dep of departmentsData) {
    const existingId = await queryInterface.rawSelect('departments', { where: { code: dep.code } }, ['id'])
    if (existingId) {
      deptMap[dep.code] = String(existingId)
    } else {
      await queryInterface.bulkInsert('departments', [dep])
      deptMap[dep.code] = dep.id
    }
  }

  // ── 4. Job Categories ──────────────────────────────────────────────────────
  const jobCategoriesData = [
    // Housekeeping (HK)
    { departmentCode: 'HK', code: 'HK_OPS', name: 'Housekeeping Operations', description: 'Housekeeping Operations' },
    { departmentCode: 'HK', code: 'HK_CLEAN', name: 'Cleaning Services', description: 'Cleaning Services' },
    { departmentCode: 'HK', code: 'HK_LAUNDRY', name: 'Laundry Services', description: 'Laundry Services' },
    { departmentCode: 'HK', code: 'HK_WASTE', name: 'Waste Management', description: 'Waste Management' },
    { departmentCode: 'HK', code: 'HK_ATTENDANT', name: 'Room Attendant', description: 'Room Attendant' },

    // Attendance & Workforce (ATT)
    { departmentCode: 'ATT', code: 'ATT_MGMT', name: 'Attendance Management', description: 'Attendance Management' },
    { departmentCode: 'ATT', code: 'ATT_WORKFORCE', name: 'Workforce Planning', description: 'Workforce Planning' },
    { departmentCode: 'ATT', code: 'ATT_HROPS', name: 'HR Operations', description: 'HR Operations' },
    { departmentCode: 'ATT', code: 'ATT_PAYROLL', name: 'Payroll & Timekeeping', description: 'Payroll & Timekeeping' },

    // Nursing (NUR)
    { departmentCode: 'NUR', code: 'NUR_OPS', name: 'Nursing Operations', description: 'Nursing Operations' },
    { departmentCode: 'NUR', code: 'NUR_CLINICAL', name: 'Clinical Nursing', description: 'Clinical Nursing' },
    { departmentCode: 'NUR', code: 'NUR_PATIENT_CARE', name: 'Patient Care', description: 'Patient Care' },
    { departmentCode: 'NUR', code: 'NUR_ADMIN', name: 'Nursing Administration', description: 'Nursing Administration' },

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

    // Events (EVT)
    { departmentCode: 'EVT', code: 'EVT_PLANNING', name: 'Event Planning', description: 'Event Planning' },
    { departmentCode: 'EVT', code: 'EVT_OPS', name: 'Event Operations', description: 'Event Operations' },
    { departmentCode: 'EVT', code: 'EVT_COMMUNITY', name: 'Community Activities', description: 'Community Activities' },
    { departmentCode: 'EVT', code: 'EVT_REC', name: 'Recreation', description: 'Recreation' },
    { departmentCode: 'EVT', code: 'EVT_ENTERTAIN', name: 'Entertainment', description: 'Entertainment' },

    // Medical / Doctor (DOC)
    { departmentCode: 'DOC', code: 'DOC_GEN', name: 'General Medicine', description: 'General Medicine' },
    { departmentCode: 'DOC', code: 'DOC_SPEC', name: 'Specialist Medicine', description: 'Specialist Medicine' },
    { departmentCode: 'DOC', code: 'DOC_CLINICAL', name: 'Clinical Services', description: 'Clinical Services' },
    { departmentCode: 'DOC', code: 'DOC_DIAG', name: 'Diagnostics', description: 'Diagnostics' },
    { departmentCode: 'DOC', code: 'DOC_EMERGENCY', name: 'Emergency Care', description: 'Emergency Care' },

    // Gate & Security (SEC)
    { departmentCode: 'SEC', code: 'SEC_GATE', name: 'Gate & Security', description: 'Gate & Security staff' },
  ]

  for (const jc of jobCategoriesData) {
    const deptId = deptMap[jc.departmentCode]
    if (deptId) {
      const existing = await queryInterface.rawSelect('job_categories', { where: { code: jc.code } }, ['id'])
      if (!existing) {
        await queryInterface.bulkInsert('job_categories', [
          {
            id: randomUUID(),
            departmentId: deptId,
            code: jc.code,
            name: jc.name,
            description: jc.description,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        ])
      }
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

  const defaultId = '00000000-0000-0000-0000-000000000000'
  await queryInterface.bulkDelete('properties', { id: defaultId })
  await queryInterface.bulkDelete('company', { id: defaultId })
}
