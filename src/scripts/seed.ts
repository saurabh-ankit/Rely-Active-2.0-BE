import bcrypt from 'bcryptjs'
import sequelize from '../config/db/index.js'
import { Department, JobCategory, Resource, Role, User, UserDetail, UserRole } from '../models/index.js'

export async function seedRbacData() {
  console.log('🌱 Starting RBAC & Super Admin Seeder...')

  await sequelize.authenticate()

  // ── 1. Roles ───────────────────────────────────────────────────────────────
  const rolesData = [
    {
      name: 'Super Admin',
      code: 'SUPER_ADMIN',
      description: 'Platform-level administrator with full system access',
      isSystem: true,
    },
    { name: 'Property Admin', code: 'ADMIN', description: 'Property-level administrator', isSystem: true },
    { name: 'Department Manager', code: 'MANAGER', description: 'Department-level manager', isSystem: true },
    { name: 'Operational Staff', code: 'EMPLOYEE', description: 'Operational staff member', isSystem: true },
    { name: 'Doctor', code: 'DOCTOR', description: 'Medical practitioner', isSystem: true },
    { name: 'Nurse', code: 'NURSE', description: 'Nursing staff member', isSystem: true },
    { name: 'Resident', code: 'RESIDENT', description: 'Resident / occupant', isSystem: true },
    { name: 'Caretaker', code: 'CARETAKER', description: 'Assigned resident caretaker', isSystem: true },
    { name: 'Vendor', code: 'VENDOR', description: 'External contractor', isSystem: true },
  ]

  const createdRoles: Record<string, Role> = {}
  for (const r of rolesData) {
    const [role] = await Role.findOrCreate({
      where: { code: r.code },
      defaults: r,
    })
    createdRoles[r.code] = role
  }
  console.log(`✅ Roles seeded: ${Object.keys(createdRoles).length}`)

  // ── 2. Resources (Modules) ──────────────────────────────────────────────────
  const resourcesData = [
    {
      key: 'FNB',
      name: 'Food',
      description: 'Food & Beverage dining and orders',
      type: 'MODULE',
      path: '/admin/fnb-history',
    },
    {
      key: 'RESIDENT',
      name: 'Resident',
      description: 'Resident management & directory',
      type: 'MODULE',
      path: '/admin/residents',
    },
    {
      key: 'EMPLOYEE',
      name: 'Employee',
      description: 'Employee directory & staff profiles',
      type: 'MODULE',
      path: '/admin/employees',
    },
    {
      key: 'ROSTER',
      name: 'Shift & Roster',
      description: 'Shift & roster schedules',
      type: 'MODULE',
      path: '/admin/shift-roster-management',
    },
    {
      key: 'TICKETS',
      name: 'Ticket Management',
      description: 'Repair & Maintenance, Concierge, Housekeeping, Food Tickets',
      type: 'MODULE',
      path: '/admin/tickets',
    },
    {
      key: 'GNS',
      name: 'Gate & Security',
      description: 'Gate passes, visitor check-ins & security scans',
      type: 'MODULE',
      path: '/admin/visitor-history',
    },
    {
      key: 'INVENTORY',
      name: 'Inventory',
      description: 'Inventory & stock management',
      type: 'MODULE',
      path: '/admin/inventory/home',
    },
    {
      key: 'ASSET',
      name: 'Asset Management',
      description: 'Asset tracking & maintenance',
      type: 'MODULE',
      path: '/admin/asset-management',
    },
    {
      key: 'MEDICAL',
      name: 'Medical',
      description: 'Medical dashboard, care tasks & records',
      type: 'MODULE',
      path: '/admin/medical',
    },
    {
      key: 'BILLING',
      name: 'Billing',
      description: 'Invoices, payments & ledgers',
      type: 'MODULE',
      path: '/admin/billing-management',
    },
    {
      key: 'EVENTS',
      name: 'Events',
      description: 'Community events & activities',
      type: 'MODULE',
      path: '/admin/events',
    },
  ]

  for (const resItem of resourcesData) {
    await Resource.findOrCreate({
      where: { key: resItem.key },
      defaults: resItem,
    })
  }
  console.log(`✅ Resources (Modules) seeded: ${resourcesData.length}`)

  // ── 3. Departments ─────────────────────────────────────────────────────────
  const departmentsData = [
    { code: 'RNM', name: 'Repair & Maintenance', description: 'Maintenance & engineering services' },
    { code: 'CON', name: 'Concierge', description: 'Front desk & resident services' },
    { code: 'FNB', name: 'Food & Beverage', description: 'Dining, kitchen & catering' },
    { code: 'EVT', name: 'Events', description: 'Community events & activities' },
    { code: 'SEC', name: 'Gate & Security', description: 'Security guards & entry control' },
    { code: 'HK', name: 'Housekeeping', description: 'Cleaning & facilities upkeep' },
    { code: 'NUR', name: 'Nursing', description: 'Healthcare & nursing staff' },
    { code: 'DOC', name: 'Medical / Doctor', description: 'Doctors & health practitioners' },
    { code: 'ATT', name: 'Attendance & Workforce', description: 'Workforce management' },
  ]

  const createdDepartments: Record<string, Department> = {}
  for (const dep of departmentsData) {
    const [d] = await Department.findOrCreate({
      where: { code: dep.code },
      defaults: dep,
    })
    createdDepartments[dep.code] = d
  }
  console.log(`✅ Departments seeded: ${Object.keys(createdDepartments).length}`)

  // ── 4. Job Categories per Department ───────────────────────────────────────
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

  let categoryCount = 0
  for (const jc of jobCategoriesData) {
    const parentDept = createdDepartments[jc.departmentCode]
    if (parentDept) {
      await JobCategory.findOrCreate({
        where: { code: jc.code },
        defaults: {
          departmentId: parentDept.id,
          code: jc.code,
          name: jc.name,
          description: jc.description,
          isActive: true,
        },
      })
      categoryCount++
    }
  }
  console.log(`✅ Job Categories seeded: ${categoryCount}`)

  // ── 5. Seed SUPER_ADMIN User ────────────────────────────────────────────────
  const superAdminEmail = 'superadmin@rely.com'
  const defaultPassword = 'SuperAdmin@123'
  const hashedPassword = await bcrypt.hash(defaultPassword, 10)

  const [superAdminUser] = await User.findOrCreate({
    where: { email: superAdminEmail },
    defaults: {
      username: 'superadmin',
      email: superAdminEmail,
      phone: '9999999999',
      passwordHash: hashedPassword,
      status: 'ACTIVE',
      isActive: true,
      isDeleted: false,
    },
  })

  // Ensure password and active status are updated
  await superAdminUser.update({
    username: 'superadmin',
    passwordHash: hashedPassword,
    status: 'ACTIVE',
    isActive: true,
    isDeleted: false,
  })

  await UserDetail.findOrCreate({
    where: { userId: superAdminUser.id },
    defaults: {
      userId: superAdminUser.id,
      firstName: 'Super',
      lastName: 'Admin',
      designation: 'Platform Administrator',
      employeeCode: 'SA-001',
    },
  })

  const superAdminRole = createdRoles['SUPER_ADMIN']
  if (superAdminRole) {
    await UserRole.findOrCreate({
      where: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
      },
      defaults: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
        isActive: true,
      },
    })
  }

  console.log('🎉 Super Admin user seeded successfully!')
  console.log(`   Email: ${superAdminEmail}`)
  console.log(`   Password: ${defaultPassword}`)
}

if (process.argv[1]?.includes('seed.ts')) {
  seedRbacData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seeding failed:', err)
      process.exit(1)
    })
}
