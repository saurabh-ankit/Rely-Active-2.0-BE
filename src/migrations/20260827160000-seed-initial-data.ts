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
      type: 'MODULE',
      path: '/admin/fnb-history',
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
      type: 'MODULE',
      path: '/admin/residents',
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
      type: 'MODULE',
      path: '/admin/employees',
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
      type: 'MODULE',
      path: '/admin/shift-roster-management',
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
      type: 'MODULE',
      path: '/admin/tickets',
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
      type: 'MODULE',
      path: '/admin/visitor-history',
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
      type: 'MODULE',
      path: '/admin/inventory/home',
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
      type: 'MODULE',
      path: '/admin/asset-management',
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
      type: 'MODULE',
      path: '/admin/medical',
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
      type: 'MODULE',
      path: '/admin/billing-management',
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
      type: 'MODULE',
      path: '/admin/events',
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
    { departmentCode: 'RNM', code: 'ELEC', name: 'Electrician', description: 'Electrical maintenance & repairs' },
    { departmentCode: 'RNM', code: 'PLUM', name: 'Plumber', description: 'Plumbing maintenance & repairs' },
    {
      departmentCode: 'RNM',
      code: 'HVAC',
      name: 'HVAC Technician',
      description: 'Air conditioning & ventilation technician',
    },
    {
      departmentCode: 'CON',
      code: 'FDESK',
      name: 'Front Desk Executive',
      description: 'Concierge reception & desk management',
    },
    { departmentCode: 'FNB', code: 'CHEF', name: 'Head Chef', description: 'Kitchen culinary lead' },
    { departmentCode: 'FNB', code: 'WAIT', name: 'F&B Steward', description: 'Dining service steward' },
    { departmentCode: 'SEC', code: 'GUARD', name: 'Security Guard', description: 'Gate & perimeter security guard' },
    { departmentCode: 'HK', code: 'CLEAN', name: 'Housekeeper', description: 'Facility cleaning staff' },
    { departmentCode: 'NUR', code: 'SNURSE', name: 'Staff Nurse', description: 'Registered nursing staff' },
    {
      departmentCode: 'DOC',
      code: 'PHYS',
      name: 'General Physician',
      description: 'Medical doctor & healthcare practitioner',
    },
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
        designation: 'Platform Administrator',
        employeeCode: 'SA-001',
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  const existingRole = await queryInterface.rawSelect('roles', { where: { code: 'SUPER_ADMIN' } }, ['id'])
  const superAdminRoleId = existingRole ? String(existingRole) : null

  if (superAdminRoleId) {
    const userRoleExisting = await queryInterface.rawSelect(
      'user_roles',
      { where: { userId: superAdminId, roleId: superAdminRoleId } },
      ['id'],
    )
    if (!userRoleExisting) {
      await queryInterface.bulkInsert('user_roles', [
        {
          id: randomUUID(),
          userId: superAdminId,
          roleId: superAdminRoleId,
          isActive: true,
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
    await queryInterface.bulkDelete('user_roles', { userId: superAdminId })
    await queryInterface.bulkDelete('user_details', { userId: superAdminId })
    await queryInterface.bulkDelete('users', { id: superAdminId })
  }
}
