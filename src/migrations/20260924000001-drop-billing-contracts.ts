import type { QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()

  // 1. Remove the contractId FK index from billing_subscriptions (already done in a previous partial run, guard it)
  if (tables.includes('billing_subscriptions')) {
    const columns = await queryInterface.describeTable('billing_subscriptions')
    if (columns.contractId) {
      const indexes = (await queryInterface.showIndex('billing_subscriptions')) as { name: string }[]
      const contractIndex = indexes.find((i) => i.name === 'idx_billing_subs_contract_id')
      if (contractIndex) {
        await queryInterface.removeIndex('billing_subscriptions', 'idx_billing_subs_contract_id')
        console.log('✅ Removed index: idx_billing_subs_contract_id')
      }
      await queryInterface.removeColumn('billing_subscriptions', 'contractId')
      console.log('✅ Removed column: billing_subscriptions.contractId')
    } else {
      console.log('ℹ️  billing_subscriptions.contractId already removed — skipping')
    }
  }

  // 2. Drop billing_contracts — disable FK checks so MySQL allows it in one shot
  if (tables.includes('billing_contracts')) {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0')
    await queryInterface.dropTable('billing_contracts')
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
    console.log('✅ Dropped table: billing_contracts')
  } else {
    console.log('ℹ️  billing_contracts already dropped — skipping')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // Recreate billing_contracts table
  await queryInterface.createTable('billing_contracts', {
    id: { type: 'VARCHAR(36)', primaryKey: true, allowNull: false },
    billingAccountId: { type: 'VARCHAR(36)', allowNull: false, comment: 'FK -> billing_accounts.id' },
    unitId: { type: 'VARCHAR(36)', allowNull: false, comment: 'FK -> property_units.id' },
    status: { type: "ENUM('DRAFT','ACTIVE','EXPIRED','TERMINATED')", allowNull: false, defaultValue: 'DRAFT' },
    startDate: { type: 'DATE', allowNull: false },
    endDate: { type: 'DATE', allowNull: true },
    terms: { type: 'TEXT', allowNull: true },
    createdBy: { type: 'VARCHAR(36)', allowNull: true },
    updatedBy: { type: 'VARCHAR(36)', allowNull: true },
    createdAt: { type: 'DATETIME', allowNull: false },
    updatedAt: { type: 'DATETIME', allowNull: false },
  })

  await queryInterface.addIndex('billing_contracts', ['billingAccountId'], { name: 'idx_billing_contracts_account_id' })
  await queryInterface.addIndex('billing_contracts', ['unitId'], { name: 'idx_billing_contracts_unit_id' })
  await queryInterface.addIndex('billing_contracts', ['status'], { name: 'idx_billing_contracts_status' })

  // Restore contractId column on billing_subscriptions
  const tables = await queryInterface.showAllTables()
  if (tables.includes('billing_subscriptions')) {
    await queryInterface.addColumn('billing_subscriptions', 'contractId', {
      type: 'VARCHAR(36)',
      allowNull: true,
      comment: 'FK -> billing_contracts.id (optional)',
    })
    await queryInterface.addIndex('billing_subscriptions', ['contractId'], { name: 'idx_billing_subs_contract_id' })
  }

  console.log('↩️  Rolled back: restored billing_contracts + contractId column')
}
