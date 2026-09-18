import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { LedgerEntryType } from '../enums/billing.enum.js'

import type { BillingAccount } from './billingAccount.model.js'

// BillingLedgerEntry is THE SACRED APPEND-ONLY TABLE.
// ⚠️  ABSOLUTELY NO UPDATE OR DELETE — EVER.
// Extends plain Model (not BaseModel) — no createdBy/updatedBy, no updatedAt.
// This is a financial ledger, not a CRUD entity.

export interface BillingLedgerEntryAttributes {
  id: string
  billingAccountId: string
  unitId: string
  entryType: LedgerEntryType
  referenceType: string
  referenceId: string
  debitAmount: number
  creditAmount: number
  runningBalance: number
  description: string
  entryDate: Date | string
  createdAt?: Date
}

export type BillingLedgerEntryCreationAttributes = Optional<
  BillingLedgerEntryAttributes,
  'id' | 'debitAmount' | 'creditAmount' | 'createdAt'
>

export class BillingLedgerEntry
  extends Model<BillingLedgerEntryAttributes, BillingLedgerEntryCreationAttributes>
  implements BillingLedgerEntryAttributes
{
  declare id: string
  declare billingAccountId: string
  declare unitId: string
  declare entryType: LedgerEntryType
  declare referenceType: string
  declare referenceId: string
  declare debitAmount: number
  declare creditAmount: number
  declare runningBalance: number
  declare description: string
  declare entryDate: Date | string
  declare readonly createdAt: Date

  // Associations
  declare billingAccount?: BillingAccount
}

BillingLedgerEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    billingAccountId: { type: DataTypes.UUID, allowNull: false },
    unitId: { type: DataTypes.UUID, allowNull: false },
    entryType: {
      type: DataTypes.ENUM('INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'CREDIT_APPLIED', 'REFUND'),
      allowNull: false,
    },
    referenceType: { type: DataTypes.STRING(50), allowNull: false },
    referenceId: { type: DataTypes.UUID, allowNull: false },
    debitAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    creditAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    runningBalance: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      comment: 'Positive = amount owed. Negative = credit in favour of account.',
    },
    description: { type: DataTypes.STRING(500), allowNull: false },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'billing_ledger_entries',
    timestamps: false, // ⚠️  SACRED — no updatedAt, no modification possible
    // Additional runtime guard: override save/update methods in service layer
  },
)

export default BillingLedgerEntry
