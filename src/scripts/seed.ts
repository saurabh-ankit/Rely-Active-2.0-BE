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
    { departmentCode: 'RNM', code: 'RNM_PLUM', name: 'Plumbing', description: 'Plumbing maintenance & repairs' },
    { departmentCode: 'RNM', code: 'RNM_HVAC', name: 'HVAC', description: 'HVAC Technician & cooling' },
    {
      departmentCode: 'RNM',
      code: 'RNM_CIVIL',
      name: 'Civil Maintenance',
      description: 'Civil & structural maintenance',
    },
    {
      departmentCode: 'RNM',
      code: 'RNM_BIOMED',
      name: 'Biomedical Equipment',
      description: 'Biomedical equipment maintenance',
    },
    {
      departmentCode: 'RNM',
      code: 'RNM_GEN',
      name: 'General Maintenance',
      description: 'General facility maintenance',
    },

    // Food & Beverage (FNB)
    { departmentCode: 'FNB', code: 'FNB_KITCHEN', name: 'Kitchen Operations', description: 'Kitchen Operations' },
    { departmentCode: 'FNB', code: 'FNB_PROD', name: 'Food Production', description: 'Food Production' },
    { departmentCode: 'FNB', code: 'FNB_SERVICE', name: 'Food Service', description: 'Food Service' },
    { departmentCode: 'FNB', code: 'FNB_CATERING', name: 'Catering', description: 'Catering' },
    { departmentCode: 'FNB', code: 'FNB_STEWARD', name: 'Stewarding', description: 'Stewarding' },
    { departmentCode: 'FNB', code: 'FNB_NUTRITION', name: 'Nutrition & Dietary', description: 'Nutrition & Dietary' },

    // Gate & Security (SEC)
    { departmentCode: 'SEC', code: 'SEC_OPS', name: 'Security Operations', description: 'Security Operations' },
    { departmentCode: 'SEC', code: 'SEC_ACCESS', name: 'Access Control', description: 'Access Control' },
    { departmentCode: 'SEC', code: 'SEC_SURV', name: 'Surveillance', description: 'Surveillance' },
    { departmentCode: 'SEC', code: 'SEC_VISITOR', name: 'Visitor Management', description: 'Visitor Management' },
    { departmentCode: 'SEC', code: 'SEC_EMERGENCY', name: 'Emergency & Safety', description: 'Emergency & Safety' },

    // Concierge (CON)
    { departmentCode: 'CON', code: 'CON_FDESK', name: 'Front Desk', description: 'Front Desk' },
    { departmentCode: 'CON', code: 'CON_GUEST', name: 'Guest Services', description: 'Guest Services' },
    { departmentCode: 'CON', code: 'CON_RESIDENT', name: 'Resident Services', description: 'Resident Services' },
    { departmentCode: 'CON', code: 'CON_TRANS', name: 'Transportation', description: 'Transportation' },
    { departmentCode: 'CON', code: 'CON_SUPPORT', name: 'Customer Support', description: 'Customer Support' },

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
  ]

  const validCodes = jobCategoriesData.map((jc) => jc.code)
  await JobCategory.destroy({
    where: {
      code: {
        [Op.notIn]: validCodes,
      },
    },
  })

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
