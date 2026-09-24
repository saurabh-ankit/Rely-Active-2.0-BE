import { QueryInterface, DataTypes } from 'sequelize'

export const up = async ({ context: queryInterface }: { context: QueryInterface }) => {
  // 1. Drop all 14 legacy rely-active-2.0 billing tables
  const legacyTables = [
    'billing_payment_allocations',
    'billing_payments',
    'billing_runs',
    'billing_ledger_entries',
    'billing_invoice_lines',
    'billing_invoices',
    'billing_events',
    'billing_subscriptions',
    'billing_contracts',
    'billing_price_plans',
    'billing_products',
    'billing_parties',
    'billing_accounts',
    'billing_unit_residents',
  ]

  for (const table of legacyTables) {
    await queryInterface.dropTable(table, { cascade: true }).catch(() => {})
  }

  // 2. Create invoices table
  await queryInterface.createTable('invoices', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    loc_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    tax: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    discount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    discountPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    discountAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    discountedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'INR',
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(
        'DRAFT',
        'PENDING',
        'PAID',
        'PARTIALLY_PAID',
        'CANCELLED',
        'OVERDUE',
        'OBSOLETE',
        'CARRY_FORWARDED',
      ),
      defaultValue: 'DRAFT',
      allowNull: false,
    },
    billingMode: {
      type: DataTypes.ENUM('MONTHLY'),
      defaultValue: 'MONTHLY',
      allowNull: false,
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    paidAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.ENUM('CASH', 'UPI', 'CHEQUE', 'CARD', 'NET_BANKING', 'OTHER'),
      allowNull: true,
    },
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    invoiceData: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    isFinalBill: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    depositDeduction: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    advanceDeduction: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    refundAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    netRefundDue: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    refundNote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    banking_on: {
      type: DataTypes.ENUM('location', 'company'),
      defaultValue: 'company',
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // 3. Create services_invoice table
  await queryInterface.createTable('services_invoice', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'invoices',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    serviceType: {
      type: DataTypes.ENUM('food_package', 'food_orders', 'monthly_rents'),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 1,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // 4. Create receipts table
  await queryInterface.createTable('receipts', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    receiptNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'invoices',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    paidAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.ENUM('CASH', 'UPI', 'CHEQUE', 'CARD', 'NET_BANKING', 'OTHER'),
      allowNull: false,
    },
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    handed_over_to: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    invoiceRemainingBalance: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    invoiceStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // 5. Create miscellaneous_billing table (miscellaneous_at_billing)
  await queryInterface.createTable('miscellaneous_billing', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'invoices',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 1,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // 6. Create unit_miscellaneous_items table (miscellaneous_at_services)
  await queryInterface.createTable('unit_miscellaneous_items', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    inventoryItemId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    itemName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    totalQuantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    quantityTaken: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    loc_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    isBilled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // 7. Create carried_forward_invoices table
  await queryInterface.createTable('carried_forward_invoices', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    originalInvoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    newInvoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    carriedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // 8. Create invoice_documents table
  await queryInterface.createTable('invoice_documents', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    documentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })
}

export const down = async ({ context: queryInterface }: { context: QueryInterface }) => {
  await queryInterface.dropTable('invoice_documents').catch(() => {})
  await queryInterface.dropTable('carried_forward_invoices').catch(() => {})
  await queryInterface.dropTable('unit_miscellaneous_items').catch(() => {})
  await queryInterface.dropTable('miscellaneous_billing').catch(() => {})
  await queryInterface.dropTable('receipts').catch(() => {})
  await queryInterface.dropTable('services_invoice').catch(() => {})
  await queryInterface.dropTable('invoices').catch(() => {})
}
