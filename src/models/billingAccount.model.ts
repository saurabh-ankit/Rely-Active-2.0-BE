import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import {
  BillingAccountStatus,
  BillingCycle,
  BillingMode,
} from '../enums/billing.enum.js'

import type { PropertyUnit } from './propertyUnit.model.js'
import type { Property } from './property.model.js'
import type { Company } from './company.model.js'
import type { Resident } from './resident.model.js'
import type { BillingParty } from './billingParty.model.js'
import type { BillingSubscription } from './billingSubscription.model.js'
import type { Invoice } from './invoice.model.js'
import type { Payment } from './payment.model.js'
import type { BillingLedgerEntry } from './billingLedgerEntry.model.js'

export interface BillingAccountAttributes extends BaseAttributes {
  accountNumber: string
  unitId: string
  propertyId: string
  companyId: string
  primaryResidentId?: string | null
  accountName: string
  billingMode: BillingMode
  status: BillingAccountStatus
  billingCycle: BillingCycle
  billingDay: number
  currency: string
  creditBalance: number
  notes?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type BillingAccountCreationAttributes = Optional<
  BillingAccountAttributes,
  | 'id'
  | 'primaryResidentId'
  | 'billingMode'
  | 'status'
  | 'billingCycle'
  | 'billingDay'
  | 'currency'
  | 'creditBalance'
  | 'notes'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class BillingAccount
  extends BaseModel<BillingAccountAttributes, BillingAccountCreationAttributes>
  implements BillingAccountAttributes
{
  declare accountNumber: string
  declare unitId: string
  declare propertyId: string
  declare companyId: string
  declare primaryResidentId: string | null
  declare accountName: string
  declare billingMode: BillingMode
  declare status: BillingAccountStatus
  declare billingCycle: BillingCycle
  declare billingDay: number
  declare currency: string
  declare creditBalance: number
  declare notes: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  // Associations
  declare unit?: PropertyUnit
  declare property?: Property
  declare company?: Company
  declare primaryResident?: Resident
  declare parties?: BillingParty[]
  declare subscriptions?: BillingSubscription[]
  declare invoices?: Invoice[]
  declare payments?: Payment[]
  declare ledgerEntries?: BillingLedgerEntry[]
}

BillingAccount.init(
  {
    ...baseModelColumns,
    accountNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
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
    primaryResidentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> residents.id | Anchor only, NOT necessarily the payer',
    },
    accountName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    billingMode: {
      type: DataTypes.ENUM('INDIVIDUAL', 'UNIT_CONSOLIDATED'),
      allowNull: false,
      defaultValue: BillingMode.INDIVIDUAL,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'SUSPENDED', 'CLOSED'),
      allowNull: false,
      defaultValue: BillingAccountStatus.ACTIVE,
    },
    billingCycle: {
      type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL'),
      allowNull: false,
      defaultValue: BillingCycle.MONTHLY,
    },
    billingDay: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
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
  },
  {
    sequelize,
    tableName: 'billing_accounts',
    timestamps: true,
  },
)

export default BillingAccount

