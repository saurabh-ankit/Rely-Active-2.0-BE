import { DataTypes, type QueryInterface } from 'sequelize'

/**
 * Add missing `createdBy` and `updatedBy` columns to billing tables
 * that use BaseModel / baseModelColumns in their models but were
 * created with commonTimestamps in the initial billing migration.
 *
 * Tables:
 * - billing_subscriptions
 * - billing_products
 * - billing_price_plans
 * - billing_payments
 *
 * Also ensure billing_contracts table exists if missing.
 */

const billingTables = ['billing_subscriptions', 'billing_products', 'billing_price_plans', 'billing_payments']

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  for (const table of billingTables) {
    const rawCols = (await queryInterface.sequelize.query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :table`,
      { replacements: { table } },
    )) as [Array<{ COLUMN_NAME: string }>, unknown]

    const existingCols = new Set(rawCols[0].map((c) => c.COLUMN_NAME))

    if (!existingCols.has('createdBy')) {
      await queryInterface.addColumn(table, 'createdBy', {
        type: DataTypes.CHAR(36),
        allowNull: true,
      })
      console.log(`✅ Added createdBy to ${table}`)
    }

    if (!existingCols.has('updatedBy')) {
      await queryInterface.addColumn(table, 'updatedBy', {
        type: DataTypes.CHAR(36),
        allowNull: true,
      })
      console.log(`✅ Added updatedBy to ${table}`)
    }
  }

  // Ensure billing_contracts exists
  const rawTables = (await queryInterface.sequelize.query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'billing_contracts'`,
  )) as [Array<{ TABLE_NAME: string }>, unknown]

  if (rawTables[0].length === 0) {
    await queryInterface.createTable('billing_contracts', {
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
      billingAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      unitId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      contractNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
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

    await queryInterface.addIndex('billing_contracts', ['billingAccountId'], {
      name: 'idx_billing_contracts_account_id',
    })
    await queryInterface.addIndex('billing_contracts', ['unitId'], {
      name: 'idx_billing_contracts_unit_id',
    })
    await queryInterface.addIndex('billing_contracts', ['status'], {
      name: 'idx_billing_contracts_status',
    })
    console.log('✅ Created table: billing_contracts')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  for (const table of billingTables) {
    try {
      await queryInterface.removeColumn(table, 'createdBy')
      await queryInterface.removeColumn(table, 'updatedBy')
    } catch {
      // ignore
    }
  }
}
