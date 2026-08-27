import { type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // 1. Delete all current role_permissions and user_permissions to avoid FK issues
  await queryInterface.bulkDelete('role_permissions', {}, {})
  await queryInterface.bulkDelete('user_permissions', {}, {})
  await queryInterface.bulkDelete('permissions', {}, {})
  await queryInterface.bulkDelete('modules', {}, {})

  // 2. Insert EXACT 11 main modules
  const modules = [
    { id: 'mod-01-fnb', name: 'Food', code: 'FNB', description: 'Food & Beverage dining and orders', icon: 'Utensils' },
    {
      id: 'mod-02-res',
      name: 'Resident',
      code: 'RESIDENT',
      description: 'Resident management & directory',
      icon: 'User',
    },
    {
      id: 'mod-03-emp',
      name: 'Employee',
      code: 'EMPLOYEE',
      description: 'Employee directory & staff profiles',
      icon: 'HandHeart',
    },
    {
      id: 'mod-04-rst',
      name: 'Shift & Roster',
      code: 'ROSTER',
      description: 'Shift & roster schedules',
      icon: 'CalendarClock',
    },
    {
      id: 'mod-05-tkt',
      name: 'Ticket Management',
      code: 'TICKETS',
      description: 'Repair & Maintenance, Concierge, Housekeeping, Food Tickets',
      icon: 'Wrench',
    },
    {
      id: 'mod-06-gns',
      name: 'Gate & Security',
      code: 'GNS',
      description: 'Gate passes, visitor check-ins & security scans',
      icon: 'ShieldCheck',
    },
    {
      id: 'mod-07-inv',
      name: 'Inventory',
      code: 'INVENTORY',
      description: 'Inventory & stock management',
      icon: 'Package',
    },
    {
      id: 'mod-08-ast',
      name: 'Asset Management',
      code: 'ASSET',
      description: 'Asset tracking & maintenance',
      icon: 'Box',
    },
    {
      id: 'mod-09-med',
      name: 'Medical',
      code: 'MEDICAL',
      description: 'Medical dashboard, care tasks & records',
      icon: 'Stethoscope',
    },
    {
      id: 'mod-10-bil',
      name: 'Billing',
      code: 'BILLING',
      description: 'Invoices, payments & ledgers',
      icon: 'Receipt',
    },
    {
      id: 'mod-11-evt',
      name: 'Events',
      code: 'EVENTS',
      description: 'Community events & activities',
      icon: 'CalendarCheck',
    },
  ]

  for (const mod of modules) {
    await queryInterface.bulkInsert('modules', [
      {
        id: mod.id,
        name: mod.name,
        code: mod.code,
        description: mod.description,
        icon: mod.icon,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
  }

  // 3. Insert 4 CRUD permissions per module
  const permissionsData = [
    // 1. Food (FNB)
    { id: 'p-fnb-1', module_id: 'mod-01-fnb', name: 'View Food Orders', code: 'FNB_VIEW', action: 'VIEW' },
    { id: 'p-fnb-2', module_id: 'mod-01-fnb', name: 'Create Food Order', code: 'FNB_CREATE', action: 'CREATE' },
    { id: 'p-fnb-3', module_id: 'mod-01-fnb', name: 'Update Food Order', code: 'FNB_UPDATE', action: 'UPDATE' },
    { id: 'p-fnb-4', module_id: 'mod-01-fnb', name: 'Delete Food Order', code: 'FNB_DELETE', action: 'DELETE' },

    // 2. Resident
    { id: 'p-res-1', module_id: 'mod-02-res', name: 'View Residents', code: 'RESIDENT_VIEW', action: 'VIEW' },
    { id: 'p-res-2', module_id: 'mod-02-res', name: 'Create Resident', code: 'RESIDENT_CREATE', action: 'CREATE' },
    { id: 'p-res-3', module_id: 'mod-02-res', name: 'Update Resident', code: 'RESIDENT_UPDATE', action: 'UPDATE' },
    { id: 'p-res-4', module_id: 'mod-02-res', name: 'Delete Resident', code: 'RESIDENT_DELETE', action: 'DELETE' },

    // 3. Employee
    { id: 'p-emp-1', module_id: 'mod-03-emp', name: 'View Employee Directory', code: 'EMPLOYEE_VIEW', action: 'VIEW' },
    { id: 'p-emp-2', module_id: 'mod-03-emp', name: 'Create Employee', code: 'EMPLOYEE_CREATE', action: 'CREATE' },
    { id: 'p-emp-3', module_id: 'mod-03-emp', name: 'Update Employee', code: 'EMPLOYEE_UPDATE', action: 'UPDATE' },
    { id: 'p-emp-4', module_id: 'mod-03-emp', name: 'Delete Employee', code: 'EMPLOYEE_DELETE', action: 'DELETE' },

    // 4. Shift & Roster
    { id: 'p-rst-1', module_id: 'mod-04-rst', name: 'View Shift & Roster', code: 'ROSTER_VIEW', action: 'VIEW' },
    { id: 'p-rst-2', module_id: 'mod-04-rst', name: 'Create Shift & Roster', code: 'ROSTER_CREATE', action: 'CREATE' },
    { id: 'p-rst-3', module_id: 'mod-04-rst', name: 'Update Shift & Roster', code: 'ROSTER_UPDATE', action: 'UPDATE' },
    { id: 'p-rst-4', module_id: 'mod-04-rst', name: 'Delete Shift & Roster', code: 'ROSTER_DELETE', action: 'DELETE' },

    // 5. Ticket Management
    { id: 'p-tkt-1', module_id: 'mod-05-tkt', name: 'View Tickets', code: 'TICKET_VIEW', action: 'VIEW' },
    { id: 'p-tkt-2', module_id: 'mod-05-tkt', name: 'Create Ticket', code: 'TICKET_CREATE', action: 'CREATE' },
    { id: 'p-tkt-3', module_id: 'mod-05-tkt', name: 'Update Ticket', code: 'TICKET_UPDATE', action: 'UPDATE' },
    { id: 'p-tkt-4', module_id: 'mod-05-tkt', name: 'Delete Ticket', code: 'TICKET_DELETE', action: 'DELETE' },

    // 6. Gate & Security
    { id: 'p-gns-1', module_id: 'mod-06-gns', name: 'View Gate & Security', code: 'GNS_VIEW', action: 'VIEW' },
    { id: 'p-gns-2', module_id: 'mod-06-gns', name: 'Create Gate Pass / Entry', code: 'GNS_CREATE', action: 'CREATE' },
    { id: 'p-gns-3', module_id: 'mod-06-gns', name: 'Update Gate Pass', code: 'GNS_UPDATE', action: 'UPDATE' },
    { id: 'p-gns-4', module_id: 'mod-06-gns', name: 'Delete Gate Pass', code: 'GNS_DELETE', action: 'DELETE' },

    // 7. Inventory
    { id: 'p-inv-1', module_id: 'mod-07-inv', name: 'View Inventory', code: 'INVENTORY_VIEW', action: 'VIEW' },
    { id: 'p-inv-2', module_id: 'mod-07-inv', name: 'Create Stock Item', code: 'INVENTORY_CREATE', action: 'CREATE' },
    { id: 'p-inv-3', module_id: 'mod-07-inv', name: 'Update Stock Item', code: 'INVENTORY_UPDATE', action: 'UPDATE' },
    { id: 'p-inv-4', module_id: 'mod-07-inv', name: 'Delete Stock Item', code: 'INVENTORY_DELETE', action: 'DELETE' },

    // 8. Asset Management
    { id: 'p-ast-1', module_id: 'mod-08-ast', name: 'View Assets', code: 'ASSET_VIEW', action: 'VIEW' },
    { id: 'p-ast-2', module_id: 'mod-08-ast', name: 'Create Asset', code: 'ASSET_CREATE', action: 'CREATE' },
    { id: 'p-ast-3', module_id: 'mod-08-ast', name: 'Update Asset', code: 'ASSET_UPDATE', action: 'UPDATE' },
    { id: 'p-ast-4', module_id: 'mod-08-ast', name: 'Delete Asset', code: 'ASSET_DELETE', action: 'DELETE' },

    // 9. Medical
    { id: 'p-med-1', module_id: 'mod-09-med', name: 'View Medical Dashboard', code: 'MEDICAL_VIEW', action: 'VIEW' },
    {
      id: 'p-med-2',
      module_id: 'mod-09-med',
      name: 'Create Care Task / Record',
      code: 'MEDICAL_CREATE',
      action: 'CREATE',
    },
    { id: 'p-med-3', module_id: 'mod-09-med', name: 'Update Medical Record', code: 'MEDICAL_UPDATE', action: 'UPDATE' },
    { id: 'p-med-4', module_id: 'mod-09-med', name: 'Delete Medical Record', code: 'MEDICAL_DELETE', action: 'DELETE' },

    // 10. Billing
    { id: 'p-bil-1', module_id: 'mod-10-bil', name: 'View Invoices & Ledgers', code: 'BILLING_VIEW', action: 'VIEW' },
    { id: 'p-bil-2', module_id: 'mod-10-bil', name: 'Create Invoice', code: 'BILLING_CREATE', action: 'CREATE' },
    { id: 'p-bil-3', module_id: 'mod-10-bil', name: 'Update Invoice', code: 'BILLING_UPDATE', action: 'UPDATE' },
    { id: 'p-bil-4', module_id: 'mod-10-bil', name: 'Delete Invoice', code: 'BILLING_DELETE', action: 'DELETE' },

    // 11. Events
    { id: 'p-evt-1', module_id: 'mod-11-evt', name: 'View Events', code: 'EVENTS_VIEW', action: 'VIEW' },
    { id: 'p-evt-2', module_id: 'mod-11-evt', name: 'Create Event', code: 'EVENTS_CREATE', action: 'CREATE' },
    { id: 'p-evt-3', module_id: 'mod-11-evt', name: 'Update Event', code: 'EVENTS_UPDATE', action: 'UPDATE' },
    { id: 'p-evt-4', module_id: 'mod-11-evt', name: 'Delete Event', code: 'EVENTS_DELETE', action: 'DELETE' },
  ]

  for (const perm of permissionsData) {
    await queryInterface.bulkInsert('permissions', [
      {
        id: perm.id,
        module_id: perm.module_id,
        name: perm.name,
        code: perm.code,
        action: perm.action,
        description: `Permission ${perm.code}`,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
  }
}

export async function down(): Promise<void> {
  // Rollback
}
