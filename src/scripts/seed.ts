import bcrypt from 'bcryptjs'
import sequelize from '../config/db/index.js'
import {
  Department,
  Module,
  Permission,
  Resource,
  Role,
  RolePermission,
  User,
  UserProfile,
  UserRole,
} from '../models/index.js'

export async function seedRbacData() {
  console.log('🌱 Starting RBAC & Super Admin Seeder...')

  await sequelize.authenticate()

  // ── 1. Roles ───────────────────────────────────────────────────────────────
  const rolesData = [
    { name: 'Super Admin', code: 'SUPER_ADMIN', description: 'Platform-level administrator', is_system: true },
    { name: 'Property Admin', code: 'ADMIN', description: 'Property-level administrator', is_system: true },
    { name: 'Department Manager', code: 'MANAGER', description: 'Department-level manager', is_system: true },
    { name: 'Operational Staff', code: 'EMPLOYEE', description: 'Operational staff member', is_system: true },
    { name: 'Doctor', code: 'DOCTOR', description: 'Medical practitioner', is_system: true },
    { name: 'Nurse', code: 'NURSE', description: 'Nursing staff member', is_system: true },
    { name: 'Resident', code: 'RESIDENT', description: 'Resident / occupant', is_system: true },
    { name: 'Caretaker', code: 'CARETAKER', description: 'Assigned resident caretaker', is_system: true },
    { name: 'Vendor', code: 'VENDOR', description: 'External contractor', is_system: true },
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

  // ── 2. Resources ───────────────────────────────────────────────────────────
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
  console.log(`✅ Resources seeded: ${resourcesData.length}`)

  // ── 3. Exact 11 Modules ───────────────────────────────────────────────────
  const modulesData = [
    { name: 'Food', code: 'FNB', description: 'Food & Beverage dining and orders', icon: 'Utensils' },
    { name: 'Resident', code: 'RESIDENT', description: 'Resident management & directory', icon: 'User' },
    { name: 'Employee', code: 'EMPLOYEE', description: 'Employee directory & staff profiles', icon: 'HandHeart' },
    { name: 'Shift & Roster', code: 'ROSTER', description: 'Shift & roster schedules', icon: 'CalendarClock' },
    {
      name: 'Ticket Management',
      code: 'TICKETS',
      description: 'Repair & Maintenance, Concierge, Housekeeping, Food Tickets',
      icon: 'Wrench',
    },
    {
      name: 'Gate & Security',
      code: 'GNS',
      description: 'Gate passes, visitor check-ins & security scans',
      icon: 'ShieldCheck',
    },
    { name: 'Inventory', code: 'INVENTORY', description: 'Inventory & stock management', icon: 'Package' },
    { name: 'Asset Management', code: 'ASSET', description: 'Asset tracking & maintenance', icon: 'Box' },
    { name: 'Medical', code: 'MEDICAL', description: 'Medical dashboard, care tasks & records', icon: 'Stethoscope' },
    { name: 'Billing', code: 'BILLING', description: 'Invoices, payments & ledgers', icon: 'Receipt' },
    { name: 'Events', code: 'EVENTS', description: 'Community events & activities', icon: 'CalendarCheck' },
  ]

  const createdModules: Record<string, Module> = {}
  for (const m of modulesData) {
    const [mod] = await Module.findOrCreate({
      where: { code: m.code },
      defaults: m,
    })
    createdModules[m.code] = mod
  }
  console.log(`✅ Modules seeded: ${Object.keys(createdModules).length}`)

  // ── 4. 4 CRUD Permissions per Module ────────────────────────────────────────
  const permissionsData = [
    // 1. Food (FNB)
    { moduleCode: 'FNB', code: 'FNB_VIEW', name: 'View Food Orders', action: 'VIEW' },
    { moduleCode: 'FNB', code: 'FNB_CREATE', name: 'Create Food Order', action: 'CREATE' },
    { moduleCode: 'FNB', code: 'FNB_UPDATE', name: 'Update Food Order', action: 'UPDATE' },
    { moduleCode: 'FNB', code: 'FNB_DELETE', name: 'Delete Food Order', action: 'DELETE' },

    // 2. Resident
    { moduleCode: 'RESIDENT', code: 'RESIDENT_VIEW', name: 'View Residents', action: 'VIEW' },
    { moduleCode: 'RESIDENT', code: 'RESIDENT_CREATE', name: 'Create Resident', action: 'CREATE' },
    { moduleCode: 'RESIDENT', code: 'RESIDENT_UPDATE', name: 'Update Resident', action: 'UPDATE' },
    { moduleCode: 'RESIDENT', code: 'RESIDENT_DELETE', name: 'Delete Resident', action: 'DELETE' },

    // 3. Employee
    { moduleCode: 'EMPLOYEE', code: 'EMPLOYEE_VIEW', name: 'View Employee Directory', action: 'VIEW' },
    { moduleCode: 'EMPLOYEE', code: 'EMPLOYEE_CREATE', name: 'Create Employee', action: 'CREATE' },
    { moduleCode: 'EMPLOYEE', code: 'EMPLOYEE_UPDATE', name: 'Update Employee', action: 'UPDATE' },
    { moduleCode: 'EMPLOYEE', code: 'EMPLOYEE_DELETE', name: 'Delete Employee', action: 'DELETE' },

    // 4. Shift & Roster
    { moduleCode: 'ROSTER', code: 'ROSTER_VIEW', name: 'View Shift & Roster', action: 'VIEW' },
    { moduleCode: 'ROSTER', code: 'ROSTER_CREATE', name: 'Create Shift & Roster', action: 'CREATE' },
    { moduleCode: 'ROSTER', code: 'ROSTER_UPDATE', name: 'Update Shift & Roster', action: 'UPDATE' },
    { moduleCode: 'ROSTER', code: 'ROSTER_DELETE', name: 'Delete Shift & Roster', action: 'DELETE' },

    // 5. Ticket Management
    { moduleCode: 'TICKETS', code: 'TICKET_VIEW', name: 'View Tickets', action: 'VIEW' },
    { moduleCode: 'TICKETS', code: 'TICKET_CREATE', name: 'Create Ticket', action: 'CREATE' },
    { moduleCode: 'TICKETS', code: 'TICKET_UPDATE', name: 'Update Ticket', action: 'UPDATE' },
    { moduleCode: 'TICKETS', code: 'TICKET_DELETE', name: 'Delete Ticket', action: 'DELETE' },

    // 6. Gate & Security
    { moduleCode: 'GNS', code: 'GNS_VIEW', name: 'View Gate & Security', action: 'VIEW' },
    { moduleCode: 'GNS', code: 'GNS_CREATE', name: 'Create Gate Pass / Entry', action: 'CREATE' },
    { moduleCode: 'GNS', code: 'GNS_UPDATE', name: 'Update Gate Pass', action: 'UPDATE' },
    { moduleCode: 'GNS', code: 'GNS_DELETE', name: 'Delete Gate Pass', action: 'DELETE' },

    // 7. Inventory
    { moduleCode: 'INVENTORY', code: 'INVENTORY_VIEW', name: 'View Inventory', action: 'VIEW' },
    { moduleCode: 'INVENTORY', code: 'INVENTORY_CREATE', name: 'Create Stock Item', action: 'CREATE' },
    { moduleCode: 'INVENTORY', code: 'INVENTORY_UPDATE', name: 'Update Stock Item', action: 'UPDATE' },
    { moduleCode: 'INVENTORY', code: 'INVENTORY_DELETE', name: 'Delete Stock Item', action: 'DELETE' },

    // 8. Asset Management
    { moduleCode: 'ASSET', code: 'ASSET_VIEW', name: 'View Assets', action: 'VIEW' },
    { moduleCode: 'ASSET', code: 'ASSET_CREATE', name: 'Create Asset', action: 'CREATE' },
    { moduleCode: 'ASSET', code: 'ASSET_UPDATE', name: 'Update Asset', action: 'UPDATE' },
    { moduleCode: 'ASSET', code: 'ASSET_DELETE', name: 'Delete Asset', action: 'DELETE' },

    // 9. Medical
    { moduleCode: 'MEDICAL', code: 'MEDICAL_VIEW', name: 'View Medical Dashboard', action: 'VIEW' },
    { moduleCode: 'MEDICAL', code: 'MEDICAL_CREATE', name: 'Create Care Task / Record', action: 'CREATE' },
    { moduleCode: 'MEDICAL', code: 'MEDICAL_UPDATE', name: 'Update Medical Record', action: 'UPDATE' },
    { moduleCode: 'MEDICAL', code: 'MEDICAL_DELETE', name: 'Delete Medical Record', action: 'DELETE' },

    // 10. Billing
    { moduleCode: 'BILLING', code: 'BILLING_VIEW', name: 'View Invoices & Ledgers', action: 'VIEW' },
    { moduleCode: 'BILLING', code: 'BILLING_CREATE', name: 'Create Invoice', action: 'CREATE' },
    { moduleCode: 'BILLING', code: 'BILLING_UPDATE', name: 'Update Invoice', action: 'UPDATE' },
    { moduleCode: 'BILLING', code: 'BILLING_DELETE', name: 'Delete Invoice', action: 'DELETE' },

    // 11. Events
    { moduleCode: 'EVENTS', code: 'EVENTS_VIEW', name: 'View Events', action: 'VIEW' },
    { moduleCode: 'EVENTS', code: 'EVENTS_CREATE', name: 'Create Event', action: 'CREATE' },
    { moduleCode: 'EVENTS', code: 'EVENTS_UPDATE', name: 'Update Event', action: 'UPDATE' },
    { moduleCode: 'EVENTS', code: 'EVENTS_DELETE', name: 'Delete Event', action: 'DELETE' },
  ]

  const allPermissions: Permission[] = []
  for (const p of permissionsData) {
    const parentModule = createdModules[p.moduleCode]
    if (!parentModule) continue
    const [perm] = await Permission.findOrCreate({
      where: { code: p.code },
      defaults: {
        module_id: parentModule.id,
        name: p.name,
        code: p.code,
        action: p.action,
        description: `Permission ${p.code}`,
        isActive: true,
      },
    })
    allPermissions.push(perm)
  }
  console.log(`✅ Permissions seeded: ${allPermissions.length}`)

  // ── 5. Map ALL permissions to SUPER_ADMIN ──────────────────────────────────
  const superAdminRole = createdRoles['SUPER_ADMIN']
  if (!superAdminRole) throw new Error('SUPER_ADMIN role missing')

  for (const perm of allPermissions) {
    await RolePermission.findOrCreate({
      where: {
        role_id: superAdminRole.id,
        permission_id: perm.id,
      },
      defaults: {
        role_id: superAdminRole.id,
        permission_id: perm.id,
      },
    })
  }
  console.log(`✅ Linked ${allPermissions.length} permissions to SUPER_ADMIN role`)

  // ── 6. Departments ─────────────────────────────────────────────────────────
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

  for (const dep of departmentsData) {
    await Department.findOrCreate({
      where: { code: dep.code },
      defaults: dep,
    })
  }
  console.log(`✅ Departments seeded: ${departmentsData.length}`)

  // ── 7. Seed SUPER_ADMIN User ────────────────────────────────────────────────
  const superAdminEmail = 'superadmin@rely.com'
  const defaultPassword = 'SuperAdmin@123'
  const hashedPassword = await bcrypt.hash(defaultPassword, 10)

  const [superAdminUser] = await User.findOrCreate({
    where: { email: superAdminEmail },
    defaults: {
      email: superAdminEmail,
      phone: '9999999999',
      password_hash: hashedPassword,
      status: 'ACTIVE',
      isActive: true,
      isDeleted: false,
    },
  })

  // Ensure password and active status are updated
  await superAdminUser.update({
    password_hash: hashedPassword,
    status: 'ACTIVE',
    isActive: true,
    isDeleted: false,
  })

  await UserProfile.findOrCreate({
    where: { user_id: superAdminUser.id },
    defaults: {
      user_id: superAdminUser.id,
      first_name: 'Super',
      last_name: 'Admin',
      designation: 'Platform Administrator',
      employee_code: 'SA-001',
    },
  })

  await UserRole.findOrCreate({
    where: {
      user_id: superAdminUser.id,
      role_id: superAdminRole.id,
    },
    defaults: {
      user_id: superAdminUser.id,
      role_id: superAdminRole.id,
      isActive: true,
    },
  })

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
