import bcrypt from 'bcryptjs'
import { Op } from 'sequelize'
import sequelize from '../config/db/index.js'
import { Department, JobCategory, Property, Resource, Role, User, UserDetail, UserLocation } from '../models/index.js'

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
    { name: 'Caretaker', code: 'CARETAKER', description: 'Assigned resident caretaker', isSystem: true },
    { name: 'Vendor', code: 'VENDOR', description: 'External contractor', isSystem: true },
  ]

  // Remove obsolete Resident role if present
  await Role.destroy({ where: { code: 'RESIDENT' } })

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
    },
    {
      key: 'RESIDENT',
      name: 'Resident',
      description: 'Resident management & directory',
    },
    {
      key: 'EMPLOYEE',
      name: 'Employee',
      description: 'Employee directory & staff profiles',
    },
    {
      key: 'ROSTER',
      name: 'Shift & Roster',
      description: 'Shift & roster schedules',
    },
    {
      key: 'TICKETS',
      name: 'Ticket Management',
      description: 'Repair & Maintenance, Concierge, Housekeeping, Food Tickets',
    },
    {
      key: 'GNS',
      name: 'Gate & Security',
      description: 'Gate passes, visitor check-ins & security scans',
    },
    {
      key: 'INVENTORY',
      name: 'Inventory',
      description: 'Inventory & stock management',
    },
    {
      key: 'ASSET',
      name: 'Asset Management',
      description: 'Asset tracking & maintenance',
    },
    {
      key: 'MEDICAL',
      name: 'Medical',
      description: 'Medical dashboard, care tasks & records',
    },
    {
      key: 'BILLING',
      name: 'Billing',
      description: 'Invoices, payments & ledgers',
    },
    {
      key: 'EVENTS',
      name: 'Events',
      description: 'Community events & activities',
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
    { code: 'MED', name: 'Medical', description: 'Medical & Healthcare Services' },
  ]

  // Find obsolete departments (NUR, DOC, ADM, ATT, FIN)
  const obsoleteDepts = await Department.findAll({ where: { code: ['NUR', 'DOC', 'ADM', 'ATT', 'FIN'] } })
  const obsoleteDeptIds = obsoleteDepts.map((d) => d.id)

  const OBSOLETE_CATEGORY_NAMES = [
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

  // ── 4. Job Categories per Department ───────────────────────────────────────
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

    // Food & Beverage (FNB) - ONLY F&B Operations
    { departmentCode: 'FNB', code: 'FNB_OPS', name: 'F&B Operations', description: 'Food & Beverage Operations' },

    // Gate & Security (SEC) - ONLY Visitor Management
    { departmentCode: 'SEC', code: 'SEC_VISITOR', name: 'Visitor Management', description: 'Visitor Management' },

    // Housekeeping (HK) - ONLY Housekeeping Operations
    { departmentCode: 'HK', code: 'HK_OPS', name: 'Housekeeping Operations', description: 'Housekeeping Operations' },

    // Events (EVT) - ONLY Event Operations
    { departmentCode: 'EVT', code: 'EVT_OPS', name: 'Event Operations', description: 'Event Operations' },

    // Medical (MED)
    { departmentCode: 'MED', code: 'MED_INHOUSE', name: 'Inhouse', description: 'In-house Medical Staff' },
    { departmentCode: 'MED', code: 'MED_VISITING', name: 'Visiting', description: 'Visiting Medical Staff' },
  ]

  const validCodes = jobCategoriesData.map((jc) => jc.code)

  // Hard delete obsolete job categories
  await JobCategory.destroy({
    where: {
      [Op.or]: [
        { code: { [Op.notIn]: validCodes } },
        { name: { [Op.in]: OBSOLETE_CATEGORY_NAMES } },
        ...(obsoleteDeptIds.length > 0 ? [{ departmentId: { [Op.in]: obsoleteDeptIds } }] : []),
      ],
    },
  })

  // Hard delete obsolete departments (NUR, DOC, ADM, ATT, FIN)
  await Department.destroy({
    where: { code: ['NUR', 'DOC', 'ADM', 'ATT', 'FIN'] },
  })

  const createdDepartments: Record<string, Department> = {}
  for (const dep of departmentsData) {
    const [d, created] = await Department.findOrCreate({
      where: { code: dep.code },
      defaults: { ...dep, isActive: true },
    })
    if (!created) {
      await d.update({ name: dep.name, description: dep.description, isActive: true })
    }
    createdDepartments[dep.code] = d
  }
  console.log(`✅ Departments seeded: ${Object.keys(createdDepartments).length}`)

  let categoryCount = 0
  for (const jc of jobCategoriesData) {
    const parentDept = createdDepartments[jc.departmentCode]
    if (parentDept) {
      const [cat, created] = await JobCategory.findOrCreate({
        where: { code: jc.code },
        defaults: {
          departmentId: parentDept.id,
          code: jc.code,
          name: jc.name,
          description: jc.description,
          isActive: true,
        },
      })
      if (!created) {
        await cat.update({
          departmentId: parentDept.id,
          name: jc.name,
          description: jc.description,
          isActive: true,
        })
      }
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
      dateOfJoining: '2026-08-28',
      employeeCode: 'EMP-20260828-0001',
    },
  })

  const superAdminRole = createdRoles['SUPER_ADMIN']
  if (superAdminRole) {
    const firstProperty = await Property.findOne()
    const locId = firstProperty?.id || '00000000-0000-0000-0000-000000000000'
    await UserLocation.findOrCreate({
      where: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
      },
      defaults: {
        userId: superAdminUser.id,
        locId,
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
