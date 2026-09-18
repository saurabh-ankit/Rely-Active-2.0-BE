import { DataTypes, type QueryInterface } from 'sequelize'

const commonAuditFields = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
  updatedBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}

const commonTimestamps = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  // Clean up any legacy un-prefixed table if present
  if (tables.includes('unit_residents')) {
    await queryInterface.dropTable('unit_residents')
    console.log('🧹 Cleaned up legacy un-prefixed table: unit_residents')
  }

  // ── 1. TABLE: billing_unit_residents ──────────────────────────────────────
  if (!tables.includes('billing_unit_residents')) {
    await queryInterface.createTable('billing_unit_residents', {
      ...commonAuditFields,
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> property_units.id',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> residents.id',
      },
      relationshipType: {
        type: DataTypes.ENUM('OWNER', 'TENANT', 'SPOUSE', 'DEPENDENT', 'CO_RESIDENT', 'CARETAKER'),
        allowNull: false,
        defaultValue: 'OWNER',
        comment: 'Legal relationship of resident to the unit',
      },
      isPrimary: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Primary contact/occupant for this unit',
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'When occupancy/ownership started',
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'NULL = currently residing/owning',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })

    await queryInterface.addIndex('billing_unit_residents', ['unitId', 'residentId', 'startDate'], {
      unique: true,
      name: 'uq_billing_unit_resident_active',
    })
    await queryInterface.addIndex('billing_unit_residents', ['unitId'], { name: 'idx_billing_unit_residents_unit_id' })
    await queryInterface.addIndex('billing_unit_residents', ['residentId'], {
      name: 'idx_billing_unit_residents_resident_id',
    })
    await queryInterface.addIndex('billing_unit_residents', ['isActive'], {
      name: 'idx_billing_unit_residents_is_active',
    })
    console.log('✅ Created table: billing_unit_residents')
  }

  // ── 2. TABLE: billing_products ────────────────────────────────────────────
  if (!tables.includes('billing_products')) {
    await queryInterface.createTable('billing_products', {
      ...commonTimestamps,
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> company.id',
      },
      productCode: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'Unique product code e.g. ACCOM-RENT, FOOD-PKG-VEG',
      },
      productName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM(
          'ACCOMMODATION',
          'FOOD',
          'CARE',
          'HOUSEKEEPING',
          'TRANSPORT',
          'ACTIVITY',
          'UTILITY',
          'CONSUMABLE',
          'GUEST_SERVICE',
          'SECURITY_DEPOSIT',
          'ONE_TIME',
          'OTHER',
        ),
        allowNull: false,
      },
      chargeType: {
        type: DataTypes.ENUM('SUBSCRIPTION', 'USAGE', 'ONE_TIME'),
        allowNull: false,
        comment: 'SUBSCRIPTION=recurring, USAGE=per-use, ONE_TIME=once',
      },
      unitLabel: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: 'unit',
        comment: 'e.g. meal, day, visit, month',
      },
      isTaxable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      defaultTaxRate: {
        type: DataTypes.DECIMAL(6, 3),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'GST % e.g. 18.000',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })

    await queryInterface.addIndex('billing_products', ['companyId'], { name: 'idx_billing_products_company_id' })
    await queryInterface.addIndex('billing_products', ['category'], { name: 'idx_billing_products_category' })
    await queryInterface.addIndex('billing_products', ['chargeType'], { name: 'idx_billing_products_charge_type' })
    await queryInterface.addIndex('billing_products', ['isActive'], { name: 'idx_billing_products_is_active' })
    console.log('✅ Created table: billing_products')
  }

  // ── 3. TABLE: billing_price_plans ─────────────────────────────────────────
  if (!tables.includes('billing_price_plans')) {
    await queryInterface.createTable('billing_price_plans', {
      ...commonTimestamps,
      productId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_products.id',
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> properties.id',
      },
      planCode: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'e.g. ACCOM-RENT-A101-2026',
      },
      planName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Human-readable plan name',
      },
      unitPrice: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        comment: 'Price per unit in currency',
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'INR',
      },
      effectiveFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'Price valid from this date',
      },
      effectiveTo: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'NULL = currently active plan',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })

    await queryInterface.addIndex('billing_price_plans', ['productId'], { name: 'idx_billing_price_plans_product_id' })
    await queryInterface.addIndex('billing_price_plans', ['propertyId'], {
      name: 'idx_billing_price_plans_property_id',
    })
    await queryInterface.addIndex('billing_price_plans', ['productId', 'propertyId', 'effectiveFrom'], {
      name: 'idx_billing_price_plans_lookup',
    })
    await queryInterface.addIndex('billing_price_plans', ['isActive'], { name: 'idx_billing_price_plans_is_active' })
    console.log('✅ Created table: billing_price_plans')
  }

  // ── 4. TABLE: billing_accounts ────────────────────────────────────────────
  if (!tables.includes('billing_accounts')) {
    await queryInterface.createTable('billing_accounts', {
      ...commonAuditFields,
      accountNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Human-readable unique account number e.g. BA-001',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> property_units.id | Physical unit this folio is for',
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> properties.id',
      },
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> company.id',
      },
      primaryResidentId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> residents.id | Anchor resident — NOT necessarily the payer',
      },
      accountName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'e.g. "Flat A-101 — Master Folio"',
      },
      billingMode: {
        type: DataTypes.ENUM('INDIVIDUAL', 'UNIT_CONSOLIDATED'),
        allowNull: false,
        defaultValue: 'INDIVIDUAL',
        comment: 'INDIVIDUAL=separate per resident, UNIT_CONSOLIDATED=one bill for all',
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'SUSPENDED', 'CLOSED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      billingCycle: {
        type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL'),
        allowNull: false,
        defaultValue: 'MONTHLY',
      },
      billingDay: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: 'Day of month to generate invoice (1-28)',
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'INR',
      },
      creditBalance: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'Cached projection from ledger. Positive = credit in favour of account.',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })

    await queryInterface.addIndex('billing_accounts', ['unitId'], { name: 'idx_billing_accounts_unit_id' })
    await queryInterface.addIndex('billing_accounts', ['propertyId'], { name: 'idx_billing_accounts_property_id' })
    await queryInterface.addIndex('billing_accounts', ['companyId'], { name: 'idx_billing_accounts_company_id' })
    await queryInterface.addIndex('billing_accounts', ['primaryResidentId'], {
      name: 'idx_billing_accounts_primary_resident_id',
    })
    await queryInterface.addIndex('billing_accounts', ['status'], { name: 'idx_billing_accounts_status' })
    await queryInterface.addIndex('billing_accounts', ['isActive', 'isDeleted'], {
      name: 'idx_billing_accounts_active',
    })
    console.log('✅ Created table: billing_accounts')
  }

  // ── 5. TABLE: billing_parties ─────────────────────────────────────────────
  if (!tables.includes('billing_parties')) {
    await queryInterface.createTable('billing_parties', {
      ...commonAuditFields,
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_accounts.id (CASCADE DELETE)',
      },
      partyType: {
        type: DataTypes.ENUM('RESIDENT', 'FAMILY_MEMBER', 'GUARDIAN', 'ORGANIZATION', 'OTHER'),
        allowNull: false,
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> residents.id | Set if partyType = RESIDENT',
      },
      familyMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> resident_family_members.id | Set if partyType = FAMILY_MEMBER',
      },
      partyName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      partyEmail: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      partyPhone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      partyAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      partyGstin: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'GST number of the payer if applicable',
      },
      role: {
        type: DataTypes.ENUM('PRIMARY_PAYER', 'SECONDARY_PAYER', 'AUTHORIZED_CONTACT'),
        allowNull: false,
        defaultValue: 'PRIMARY_PAYER',
        comment: 'PRIMARY_PAYER = bills go to this person',
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })

    await queryInterface.addIndex('billing_parties', ['billingAccountId'], { name: 'idx_billing_parties_account_id' })
    await queryInterface.addIndex('billing_parties', ['residentId'], { name: 'idx_billing_parties_resident_id' })
    await queryInterface.addIndex('billing_parties', ['familyMemberId'], {
      name: 'idx_billing_parties_family_member_id',
    })
    await queryInterface.addIndex('billing_parties', ['role'], { name: 'idx_billing_parties_role' })
    console.log('✅ Created table: billing_parties')
  }

  // ── 6. TABLE: billing_contracts ───────────────────────────────────────────
  if (!tables.includes('billing_contracts')) {
    await queryInterface.createTable('billing_contracts', {
      ...commonTimestamps,
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_accounts.id',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> property_units.id',
      },
      contractNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'e.g. CON-2026-001',
      },
      contractType: {
        type: DataTypes.ENUM('STANDARD', 'TRIAL', 'CONCESSION'),
        allowNull: false,
        defaultValue: 'STANDARD',
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'NULL = open-ended contract',
      },
      billingFrequency: {
        type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL'),
        allowNull: false,
        defaultValue: 'MONTHLY',
      },
      status: {
        type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })

    await queryInterface.addIndex('billing_contracts', ['billingAccountId'], {
      name: 'idx_billing_contracts_account_id',
    })
    await queryInterface.addIndex('billing_contracts', ['unitId'], { name: 'idx_billing_contracts_unit_id' })
    await queryInterface.addIndex('billing_contracts', ['status'], { name: 'idx_billing_contracts_status' })
    console.log('✅ Created table: billing_contracts')
  }

  // ── 7. TABLE: billing_subscriptions ───────────────────────────────────────
  if (!tables.includes('billing_subscriptions')) {
    await queryInterface.createTable('billing_subscriptions', {
      ...commonTimestamps,
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_accounts.id',
      },
      contractId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> billing_contracts.id (optional)',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> property_units.id',
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_products.id',
      },
      pricePlanId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> billing_price_plans.id (optional — can override with custom price)',
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Override description for this subscription line',
      },
      quantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 1.0,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        comment: 'Effective price (may differ from price plan if overridden)',
      },
      billingFrequency: {
        type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL'),
        allowNull: false,
        defaultValue: 'MONTHLY',
      },
      prorationPolicy: {
        type: DataTypes.ENUM('DAILY', 'FULL_MONTH', 'NO_PRORATION'),
        allowNull: false,
        defaultValue: 'DAILY',
        comment: 'How to handle mid-period start/end dates',
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'NULL = ongoing subscription',
      },
      fnbPackageId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> fnb_resident_packages.id (food subscriptions only)',
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      pauseStart: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'Pause period start (e.g. resident hospitalized)',
      },
      pauseEnd: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })

    await queryInterface.addIndex('billing_subscriptions', ['billingAccountId'], {
      name: 'idx_billing_subs_account_id',
    })
    await queryInterface.addIndex('billing_subscriptions', ['contractId'], { name: 'idx_billing_subs_contract_id' })
    await queryInterface.addIndex('billing_subscriptions', ['productId'], { name: 'idx_billing_subs_product_id' })
    await queryInterface.addIndex('billing_subscriptions', ['unitId'], { name: 'idx_billing_subs_unit_id' })
    await queryInterface.addIndex('billing_subscriptions', ['status'], { name: 'idx_billing_subs_status' })
    await queryInterface.addIndex('billing_subscriptions', ['fnbPackageId'], {
      name: 'idx_billing_subs_fnb_package_id',
    })
    console.log('✅ Created table: billing_subscriptions')
  }

  // ── 8. TABLE: billing_events ──────────────────────────────────────────────
  if (!tables.includes('billing_events')) {
    await queryInterface.createTable('billing_events', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_accounts.id',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> property_units.id | Physical flat context',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> residents.id | WHO CONSUMED the service',
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> properties.id',
      },
      sourceModule: {
        type: DataTypes.ENUM('FNB', 'CARE', 'TRANSPORT', 'ACTIVITY', 'INVENTORY', 'HOUSEKEEPING', 'MANUAL', 'SYSTEM'),
        allowNull: false,
      },
      sourceType: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'e.g. MEAL_ORDER, NURSING_VISIT, TRANSPORT_BOOKING',
      },
      sourceId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'UUID of originating record in source module',
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> billing_products.id (if applicable)',
      },
      chargeType: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'e.g. EXTRA_BREAKFAST, NURSING_VISIT',
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 1.0,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'quantity * unit_price (raw, pre-tax, pre-discount)',
      },
      serviceDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'The date the service was consumed',
      },
      occurredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Timestamp when event was recorded',
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'INVOICED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      invoiceId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Set when this event is included in an invoice',
      },
      invoiceLineId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Set to the specific invoice_line that captures this event',
      },
      cancellationReason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    })

    await queryInterface.addIndex('billing_events', ['billingAccountId'], { name: 'idx_billing_events_account_id' })
    await queryInterface.addIndex('billing_events', ['residentId'], { name: 'idx_billing_events_resident_id' })
    await queryInterface.addIndex('billing_events', ['unitId'], { name: 'idx_billing_events_unit_id' })
    await queryInterface.addIndex('billing_events', ['status'], { name: 'idx_billing_events_status' })
    await queryInterface.addIndex('billing_events', ['serviceDate'], { name: 'idx_billing_events_service_date' })
    await queryInterface.addIndex('billing_events', ['sourceModule', 'sourceType', 'sourceId'], {
      name: 'idx_billing_events_source',
    })
    await queryInterface.addIndex('billing_events', ['invoiceId'], { name: 'idx_billing_events_invoice_id' })
    console.log('✅ Created table: billing_events')
  }

  // ── 9. TABLE: billing_invoices ────────────────────────────────────────────
  if (!tables.includes('billing_invoices')) {
    await queryInterface.createTable('billing_invoices', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      invoiceNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Human-readable e.g. INV-2026-0001',
      },
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_accounts.id',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> property_units.id',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> residents.id | Historical ref to primary folio owner',
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> properties.id',
      },
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> company.id',
      },
      invoiceType: {
        type: DataTypes.ENUM('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'),
        allowNull: false,
        defaultValue: 'INVOICE',
      },
      referenceInvoiceId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'For CREDIT_NOTE/DEBIT_NOTE — references the original invoice',
      },
      billToName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Snapshot from billing_parties at time of finalization',
      },
      billToEmail: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      billToPhone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      billToAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      billToGstin: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      periodStart: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      periodEnd: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      issueDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      dueDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      subtotal: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'Sum of all line subtotals before discounts',
      },
      discountTotal: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      taxableAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'subtotal - discountTotal',
      },
      taxTotal: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      roundingAdjustment: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'Rounding to nearest rupee',
      },
      grandTotal: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'taxableAmount + taxTotal + roundingAdjustment',
      },
      amountPaid: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      amountDue: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'grandTotal - amountPaid',
      },
      status: {
        type: DataTypes.ENUM('DRAFT', 'PREVIEW', 'FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'OVERDUE'),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      finalizedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'INR',
      },
      pdfUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    })

    await queryInterface.addIndex('billing_invoices', ['billingAccountId'], { name: 'idx_billing_invoices_account_id' })
    await queryInterface.addIndex('billing_invoices', ['unitId'], { name: 'idx_billing_invoices_unit_id' })
    await queryInterface.addIndex('billing_invoices', ['residentId'], { name: 'idx_billing_invoices_resident_id' })
    await queryInterface.addIndex('billing_invoices', ['status'], { name: 'idx_billing_invoices_status' })
    await queryInterface.addIndex('billing_invoices', ['periodStart', 'periodEnd'], {
      name: 'idx_billing_invoices_period',
    })
    await queryInterface.addIndex('billing_invoices', ['dueDate'], { name: 'idx_billing_invoices_due_date' })
    await queryInterface.addIndex('billing_invoices', ['invoiceType'], { name: 'idx_billing_invoices_type' })
    await queryInterface.addIndex('billing_invoices', ['isDeleted'], { name: 'idx_billing_invoices_is_deleted' })
    console.log('✅ Created table: billing_invoices')
  }

  // ── 10. TABLE: invoice_lines ──────────────────────────────────────────────
  if (!tables.includes('invoice_lines')) {
    await queryInterface.createTable('invoice_lines', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      invoiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> invoices.id (CASCADE DELETE)',
      },
      subscriptionId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> billing_subscriptions.id (if recurring charge)',
      },
      billingEventId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> billing_events.id (if usage/consumption charge)',
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> billing_products.id',
      },
      lineType: {
        type: DataTypes.ENUM('SUBSCRIPTION', 'USAGE', 'DISCOUNT', 'TAX', 'ADJUSTMENT'),
        allowNull: false,
      },
      chargeType: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'e.g. MONTHLY_RENT, EXTRA_BREAKFAST, NURSING_VISIT',
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      serviceDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'Date of service (for usage lines)',
      },
      consumedByResidentId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'FK -> residents.id | WHO used this service (consumer, not payer)',
      },
      quantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 1.0,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      subtotal: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'quantity * unit_price',
      },
      discountAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      taxableAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'subtotal - discount_amount',
      },
      taxRate: {
        type: DataTypes.DECIMAL(6, 3),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'GST % applied',
      },
      taxAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      totalAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'taxable_amount + tax_amount',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Display order on invoice',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    })

    await queryInterface.addIndex('invoice_lines', ['invoiceId'], { name: 'idx_invoice_lines_invoice_id' })
    await queryInterface.addIndex('invoice_lines', ['billingEventId'], { name: 'idx_invoice_lines_event_id' })
    await queryInterface.addIndex('invoice_lines', ['subscriptionId'], { name: 'idx_invoice_lines_subscription_id' })
    await queryInterface.addIndex('invoice_lines', ['consumedByResidentId'], { name: 'idx_invoice_lines_consumed_by' })
    console.log('✅ Created table: invoice_lines')
  }

  // ── 11. TABLE: billing_payments ───────────────────────────────────────────
  if (!tables.includes('billing_payments')) {
    await queryInterface.createTable('billing_payments', {
      ...commonTimestamps,
      paymentNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'e.g. PAY-2026-0001',
      },
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_accounts.id',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> property_units.id',
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> properties.id',
      },
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> company.id',
      },
      paymentDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'INR',
      },
      paymentMethod: {
        type: DataTypes.ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'NEFT', 'RTGS', 'CARD', 'OTHER'),
        allowNull: false,
      },
      transactionReference: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'UTR / transaction ID / cheque number',
      },
      bankName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      chequeNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'REVERSED'),
        allowNull: false,
        defaultValue: 'CONFIRMED',
      },
      confirmedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      receivedBy: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Staff member who received / recorded the payment',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    })

    await queryInterface.addIndex('billing_payments', ['billingAccountId'], { name: 'idx_billing_payments_account_id' })
    await queryInterface.addIndex('billing_payments', ['unitId'], { name: 'idx_billing_payments_unit_id' })
    await queryInterface.addIndex('billing_payments', ['status'], { name: 'idx_billing_payments_status' })
    await queryInterface.addIndex('billing_payments', ['paymentDate'], { name: 'idx_billing_payments_payment_date' })
    await queryInterface.addIndex('billing_payments', ['paymentMethod'], { name: 'idx_billing_payments_method' })
    console.log('✅ Created table: billing_payments')
  }

  // ── 12. TABLE: billing_payment_allocations ────────────────────────────────
  if (!tables.includes('billing_payment_allocations')) {
    await queryInterface.createTable('billing_payment_allocations', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      paymentId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_payments.id (CASCADE DELETE)',
      },
      invoiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_invoices.id',
      },
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_accounts.id (denormalized for reporting)',
      },
      allocatedAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        comment: 'Portion of payment applied to this invoice',
      },
      allocationDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    })

    await queryInterface.addIndex('billing_payment_allocations', ['paymentId'], {
      name: 'idx_billing_payment_alloc_payment_id',
    })
    await queryInterface.addIndex('billing_payment_allocations', ['invoiceId'], {
      name: 'idx_billing_payment_alloc_invoice_id',
    })
    await queryInterface.addIndex('billing_payment_allocations', ['billingAccountId'], {
      name: 'idx_billing_payment_alloc_account_id',
    })
    console.log('✅ Created table: billing_payment_allocations')
  }

  // ── 13. TABLE: billing_runs ───────────────────────────────────────────────
  if (!tables.includes('billing_runs')) {
    await queryInterface.createTable('billing_runs', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> properties.id',
      },
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> company.id',
      },
      billingPeriodStart: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      billingPeriodEnd: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      runType: {
        type: DataTypes.ENUM('SCHEDULED', 'MANUAL', 'PREVIEW'),
        allowNull: false,
        defaultValue: 'MANUAL',
        comment: 'PREVIEW = dry-run without creating actual invoices',
      },
      status: {
        type: DataTypes.ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'),
        allowNull: false,
        defaultValue: 'QUEUED',
      },
      totalAccounts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      successfulInvoices: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failedInvoices: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      totalAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'Total value of all invoices generated in this run',
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      runBy: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'User who triggered (NULL = system/scheduled)',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    })

    await queryInterface.addIndex('billing_runs', ['propertyId'], { name: 'idx_billing_runs_property_id' })
    await queryInterface.addIndex('billing_runs', ['status'], { name: 'idx_billing_runs_status' })
    await queryInterface.addIndex('billing_runs', ['billingPeriodStart', 'billingPeriodEnd'], {
      name: 'idx_billing_runs_period',
    })
    console.log('✅ Created table: billing_runs')
  }

  // ── 14. TABLE: billing_ledger_entries ─────────────────────────────────────
  if (!tables.includes('billing_ledger_entries')) {
    await queryInterface.createTable('billing_ledger_entries', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> billing_accounts.id',
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK -> property_units.id',
      },
      entryType: {
        type: DataTypes.ENUM('INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'CREDIT_APPLIED', 'REFUND'),
        allowNull: false,
      },
      referenceType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'e.g. "billing_invoices", "billing_payments", "billing_events"',
      },
      referenceId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'UUID of the source document',
      },
      debitAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'Money owed by account (increases balance due)',
      },
      creditAmount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'Money received or credited (decreases balance due)',
      },
      runningBalance: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        comment: 'Net balance after this entry (debit - credit cumulative)',
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'Human-readable description of what this entry represents',
      },
      entryDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'The business date of this financial event',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    })

    await queryInterface.addIndex('billing_ledger_entries', ['billingAccountId'], { name: 'idx_ledger_account_id' })
    await queryInterface.addIndex('billing_ledger_entries', ['unitId'], { name: 'idx_ledger_unit_id' })
    await queryInterface.addIndex('billing_ledger_entries', ['entryType'], { name: 'idx_ledger_entry_type' })
    await queryInterface.addIndex('billing_ledger_entries', ['referenceId'], { name: 'idx_ledger_reference_id' })
    await queryInterface.addIndex('billing_ledger_entries', ['entryDate'], { name: 'idx_ledger_entry_date' })
    await queryInterface.addIndex('billing_ledger_entries', ['billingAccountId', 'entryDate'], {
      name: 'idx_ledger_account_statement',
    })
    console.log('✅ Created table: billing_ledger_entries')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tablesToDrop = [
    'billing_ledger_entries',
    'billing_runs',
    'billing_payment_allocations',
    'billing_payments',
    'invoice_lines',
    'billing_invoices',
    'billing_events',
    'billing_subscriptions',
    'billing_contracts',
    'billing_parties',
    'billing_accounts',
    'billing_price_plans',
    'billing_products',
    'billing_unit_residents',
  ]

  for (const table of tablesToDrop) {
    await queryInterface.dropTable(table).catch(() => {})
  }
}
