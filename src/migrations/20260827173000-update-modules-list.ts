import { type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const modules = [
    { id: 'mod-auth-01', name: 'Authentication', code: 'AUTH', description: 'Authentication module', icon: 'Key' },
    {
      id: 'mod-user-02',
      name: 'User & Staff Management',
      code: 'USER_STAFF',
      description: 'Users, Employees, Roles',
      icon: 'Users',
    },
    {
      id: 'mod-prop-03',
      name: 'Property & Locations',
      code: 'PROPERTY',
      description: 'Properties, Towers, Floors, Units',
      icon: 'Building2',
    },
    {
      id: 'mod-res-04',
      name: 'Resident Management',
      code: 'RESIDENT',
      description: 'Resident directory & onboarding',
      icon: 'User',
    },
    {
      id: 'mod-emp-05',
      name: 'Employee Directory',
      code: 'EMPLOYEE',
      description: 'Staff directory & profiles',
      icon: 'HandHeart',
    },
    {
      id: 'mod-rst-06',
      name: 'Shift & Roster Management',
      code: 'ROSTER',
      description: 'Shifts, rosters & schedules',
      icon: 'CalendarClock',
    },
    {
      id: 'mod-tkt-07',
      name: 'Ticket Management',
      code: 'TICKETS',
      description: 'Repair & Maintenance, Concierge, Housekeeping, Food Tickets',
      icon: 'Wrench',
    },
    {
      id: 'mod-gns-08',
      name: 'Gate & Security',
      code: 'GNS',
      description: 'Passes, Check-ins, Security Scans',
      icon: 'ShieldCheck',
    },
    {
      id: 'mod-inv-09',
      name: 'Inventory Management',
      code: 'INVENTORY',
      description: 'Stock, inventory & requisitions',
      icon: 'Package',
    },
    {
      id: 'mod-ast-10',
      name: 'Asset Management',
      code: 'ASSET',
      description: 'Assets & maintenance history',
      icon: 'Box',
    },
    {
      id: 'mod-med-11',
      name: 'Medical Management',
      code: 'MEDICAL',
      description: 'Doctors, Nurses, ADL & Care Tasks',
      icon: 'Stethoscope',
    },
    {
      id: 'mod-fnb-12',
      name: 'Food & Beverage',
      code: 'FNB',
      description: 'Dining orders & kitchen management',
      icon: 'Utensils',
    },
    {
      id: 'mod-bil-13',
      name: 'Billing Management',
      code: 'BILLING',
      description: 'Invoices, payments & ledgers',
      icon: 'Receipt',
    },
    {
      id: 'mod-evt-14',
      name: 'Events Management',
      code: 'EVENTS',
      description: 'Community events & activities',
      icon: 'CalendarCheck',
    },
  ]

  for (const mod of modules) {
    try {
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
    } catch {
      // Ignore if already inserted
    }
  }
}

export async function down(): Promise<void> {
  // Rollback logic
}
