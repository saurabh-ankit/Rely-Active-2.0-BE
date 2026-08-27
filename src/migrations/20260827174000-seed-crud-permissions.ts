import { type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const permissionsData = [
    // USER_STAFF
    { id: 'perm-usr-01', module_id: 'mod-user-02', name: 'View Users', code: 'USER_VIEW', action: 'VIEW' },
    { id: 'perm-usr-02', module_id: 'mod-user-02', name: 'Create Users', code: 'USER_CREATE', action: 'CREATE' },
    { id: 'perm-usr-03', module_id: 'mod-user-02', name: 'Update Users', code: 'USER_UPDATE', action: 'UPDATE' },
    { id: 'perm-usr-04', module_id: 'mod-user-02', name: 'Delete Users', code: 'USER_DELETE', action: 'DELETE' },

    // PROPERTY
    { id: 'perm-prp-01', module_id: 'mod-prop-03', name: 'View Properties', code: 'PROPERTY_VIEW', action: 'VIEW' },
    {
      id: 'perm-prp-02',
      module_id: 'mod-prop-03',
      name: 'Create Properties',
      code: 'PROPERTY_CREATE',
      action: 'CREATE',
    },
    {
      id: 'perm-prp-03',
      module_id: 'mod-prop-03',
      name: 'Update Properties',
      code: 'PROPERTY_UPDATE',
      action: 'UPDATE',
    },
    {
      id: 'perm-prp-04',
      module_id: 'mod-prop-03',
      name: 'Delete Properties',
      code: 'PROPERTY_DELETE',
      action: 'DELETE',
    },

    // RESIDENT
    { id: 'perm-res-01', module_id: 'mod-res-04', name: 'View Residents', code: 'RESIDENT_VIEW', action: 'VIEW' },
    { id: 'perm-res-02', module_id: 'mod-res-04', name: 'Create Residents', code: 'RESIDENT_CREATE', action: 'CREATE' },
    { id: 'perm-res-03', module_id: 'mod-res-04', name: 'Update Residents', code: 'RESIDENT_UPDATE', action: 'UPDATE' },
    { id: 'perm-res-04', module_id: 'mod-res-04', name: 'Delete Residents', code: 'RESIDENT_DELETE', action: 'DELETE' },

    // EMPLOYEE
    {
      id: 'perm-emp-01',
      module_id: 'mod-emp-05',
      name: 'View Employee Directory',
      code: 'EMPLOYEE_VIEW',
      action: 'VIEW',
    },
    { id: 'perm-emp-02', module_id: 'mod-emp-05', name: 'Create Employee', code: 'EMPLOYEE_CREATE', action: 'CREATE' },
    { id: 'perm-emp-03', module_id: 'mod-emp-05', name: 'Update Employee', code: 'EMPLOYEE_UPDATE', action: 'UPDATE' },
    { id: 'perm-emp-04', module_id: 'mod-emp-05', name: 'Delete Employee', code: 'EMPLOYEE_DELETE', action: 'DELETE' },

    // ROSTER
    { id: 'perm-rst-01', module_id: 'mod-rst-06', name: 'View Shift & Roster', code: 'ROSTER_VIEW', action: 'VIEW' },
    {
      id: 'perm-rst-02',
      module_id: 'mod-rst-06',
      name: 'Create Shift & Roster',
      code: 'ROSTER_CREATE',
      action: 'CREATE',
    },
    {
      id: 'perm-rst-03',
      module_id: 'mod-rst-06',
      name: 'Update Shift & Roster',
      code: 'ROSTER_UPDATE',
      action: 'UPDATE',
    },
    {
      id: 'perm-rst-04',
      module_id: 'mod-rst-06',
      name: 'Delete Shift & Roster',
      code: 'ROSTER_DELETE',
      action: 'DELETE',
    },

    // TICKETS
    { id: 'perm-tkt-01', module_id: 'mod-tkt-07', name: 'View Tickets', code: 'TICKET_VIEW', action: 'VIEW' },
    { id: 'perm-tkt-02', module_id: 'mod-tkt-07', name: 'Create Ticket', code: 'TICKET_CREATE', action: 'CREATE' },
    { id: 'perm-tkt-03', module_id: 'mod-tkt-07', name: 'Update Ticket', code: 'TICKET_UPDATE', action: 'UPDATE' },
    { id: 'perm-tkt-04', module_id: 'mod-tkt-07', name: 'Delete Ticket', code: 'TICKET_DELETE', action: 'DELETE' },

    // GNS
    { id: 'perm-gns-01', module_id: 'mod-gns-08', name: 'View Gate & Security', code: 'GNS_VIEW', action: 'VIEW' },
    {
      id: 'perm-gns-02',
      module_id: 'mod-gns-08',
      name: 'Create Gate Pass / Entry',
      code: 'GNS_CREATE',
      action: 'CREATE',
    },
    { id: 'perm-gns-03', module_id: 'mod-gns-08', name: 'Update Gate Pass', code: 'GNS_UPDATE', action: 'UPDATE' },
    { id: 'perm-gns-04', module_id: 'mod-gns-08', name: 'Delete Gate Pass', code: 'GNS_DELETE', action: 'DELETE' },

    // INVENTORY
    { id: 'perm-inv-01', module_id: 'mod-inv-09', name: 'View Inventory', code: 'INVENTORY_VIEW', action: 'VIEW' },
    {
      id: 'perm-inv-02',
      module_id: 'mod-inv-09',
      name: 'Create Stock Item',
      code: 'INVENTORY_CREATE',
      action: 'CREATE',
    },
    {
      id: 'perm-inv-03',
      module_id: 'mod-inv-09',
      name: 'Update Stock Item',
      code: 'INVENTORY_UPDATE',
      action: 'UPDATE',
    },
    {
      id: 'perm-inv-04',
      module_id: 'mod-inv-09',
      name: 'Delete Stock Item',
      code: 'INVENTORY_DELETE',
      action: 'DELETE',
    },

    // ASSET
    { id: 'perm-ast-01', module_id: 'mod-ast-10', name: 'View Assets', code: 'ASSET_VIEW', action: 'VIEW' },
    { id: 'perm-ast-02', module_id: 'mod-ast-10', name: 'Create Asset', code: 'ASSET_CREATE', action: 'CREATE' },
    { id: 'perm-ast-03', module_id: 'mod-ast-10', name: 'Update Asset', code: 'ASSET_UPDATE', action: 'UPDATE' },
    { id: 'perm-ast-04', module_id: 'mod-ast-10', name: 'Delete Asset', code: 'ASSET_DELETE', action: 'DELETE' },

    // MEDICAL
    {
      id: 'perm-med-01',
      module_id: 'mod-med-11',
      name: 'View Medical Dashboard',
      code: 'MEDICAL_VIEW',
      action: 'VIEW',
    },
    {
      id: 'perm-med-02',
      module_id: 'mod-med-11',
      name: 'Create Care Task / Record',
      code: 'MEDICAL_CREATE',
      action: 'CREATE',
    },
    {
      id: 'perm-med-03',
      module_id: 'mod-med-11',
      name: 'Update Medical Record',
      code: 'MEDICAL_UPDATE',
      action: 'UPDATE',
    },
    {
      id: 'perm-med-04',
      module_id: 'mod-med-11',
      name: 'Delete Medical Record',
      code: 'MEDICAL_DELETE',
      action: 'DELETE',
    },

    // FNB
    { id: 'perm-fnb-01', module_id: 'mod-fnb-12', name: 'View Food Orders', code: 'FNB_VIEW', action: 'VIEW' },
    { id: 'perm-fnb-02', module_id: 'mod-fnb-12', name: 'Create Food Order', code: 'FNB_CREATE', action: 'CREATE' },
    { id: 'perm-fnb-03', module_id: 'mod-fnb-12', name: 'Update Order Status', code: 'FNB_UPDATE', action: 'UPDATE' },
    { id: 'perm-fnb-04', module_id: 'mod-fnb-12', name: 'Delete / Cancel Order', code: 'FNB_DELETE', action: 'DELETE' },

    // BILLING
    {
      id: 'perm-bil-01',
      module_id: 'mod-bil-13',
      name: 'View Invoices & Ledgers',
      code: 'BILLING_VIEW',
      action: 'VIEW',
    },
    { id: 'perm-bil-02', module_id: 'mod-bil-13', name: 'Create Invoice', code: 'BILLING_CREATE', action: 'CREATE' },
    { id: 'perm-bil-03', module_id: 'mod-bil-13', name: 'Update Invoice', code: 'BILLING_UPDATE', action: 'UPDATE' },
    { id: 'perm-bil-04', module_id: 'mod-bil-13', name: 'Delete Invoice', code: 'BILLING_DELETE', action: 'DELETE' },

    // EVENTS
    { id: 'perm-evt-01', module_id: 'mod-evt-14', name: 'View Events', code: 'EVENTS_VIEW', action: 'VIEW' },
    { id: 'perm-evt-02', module_id: 'mod-evt-14', name: 'Create Event', code: 'EVENTS_CREATE', action: 'CREATE' },
    { id: 'perm-evt-03', module_id: 'mod-evt-14', name: 'Update Event', code: 'EVENTS_UPDATE', action: 'UPDATE' },
    { id: 'perm-evt-04', module_id: 'mod-evt-14', name: 'Delete Event', code: 'EVENTS_DELETE', action: 'DELETE' },
  ]

  for (const perm of permissionsData) {
    try {
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
    } catch {
      // Ignore duplicates
    }
  }
}

export async function down(): Promise<void> {
  // Rollback
}
