import type { Transaction } from 'sequelize'
import { Op } from 'sequelize'
import sequelize from '../../config/db/index.js'
import { BillingAccount, BillingLedgerEntry } from '../../models/index.js'
import { LedgerEntryType } from '../../enums/billing.enum.js'

export interface CreateLedgerEntryParams {
  billingAccountId: string
  unitId: string
  entryType: LedgerEntryType
  referenceType: string
  referenceId: string
  debitAmount?: number
  creditAmount?: number
  description: string
  entryDate: string | Date
}

/**
 * Appends an entry to billing_ledger_entries.
 * ⚠️ SACRED APPEND-ONLY RULE:
 * This method ONLY creates new entries. Never updates or deletes.
 * Runs with row-level lock on BillingAccount to guarantee sequence and balance integrity.
 */
export async function appendLedgerEntry(
  params: CreateLedgerEntryParams,
  externalTx?: Transaction,
): Promise<BillingLedgerEntry> {
  const execute = async (t: Transaction) => {
    // 1. Lock the billing account to serialize ledger updates
    const account = await BillingAccount.findByPk(params.billingAccountId, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    })

    if (!account) {
      throw new Error(`Billing account ${params.billingAccountId} not found`)
    }

    const debit = Number(params.debitAmount || 0)
    const credit = Number(params.creditAmount || 0)

    // 2. Fetch the latest running balance from the most recent ledger entry
    const lastEntry = await BillingLedgerEntry.findOne({
      where: { billingAccountId: params.billingAccountId },
      order: [['createdAt', 'DESC']],
      transaction: t,
    })

    const previousRunningBalance = lastEntry ? Number(lastEntry.runningBalance) : 0

    // Positive running balance = amount owed by account
    // Negative running balance = credit in favor of account
    const newRunningBalance = Number((previousRunningBalance + debit - credit).toFixed(2))

    // 3. Create the sacred ledger entry
    const entry = await BillingLedgerEntry.create(
      {
        billingAccountId: params.billingAccountId,
        unitId: params.unitId,
        entryType: params.entryType,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        debitAmount: debit,
        creditAmount: credit,
        runningBalance: newRunningBalance,
        description: params.description,
        entryDate: params.entryDate,
      },
      { transaction: t },
    )

    // 4. Update the account's cached creditBalance
    // creditBalance: positive when credit in account's favor (so -newRunningBalance if in credit)
    const accountCreditBalance = newRunningBalance < 0 ? Math.abs(newRunningBalance) : 0
    await account.update({ creditBalance: accountCreditBalance }, { transaction: t })

    return entry
  }

  if (externalTx) {
    return execute(externalTx)
  }

  return sequelize.transaction(execute)
}

/**
 * Returns ledger statement / activity history for an account.
 */
export async function getAccountLedgerStatement(
  billingAccountId: string,
  startDate?: string,
  endDate?: string,
): Promise<BillingLedgerEntry[]> {
  const whereClause: Record<string, unknown> = { billingAccountId }

  if (startDate && endDate) {
    whereClause.entryDate = { [Op.between]: [startDate, endDate] }
  } else if (startDate) {
    whereClause.entryDate = { [Op.gte]: startDate }
  } else if (endDate) {
    whereClause.entryDate = { [Op.lte]: endDate }
  }

  return BillingLedgerEntry.findAll({
    where: whereClause,
    order: [
      ['entryDate', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  })
}
