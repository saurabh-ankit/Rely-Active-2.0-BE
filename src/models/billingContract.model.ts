import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { BillingCycle, ContractStatus, ContractType } from '../enums/billing.enum.js'

import type { BillingAccount } from './billingAccount.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'
import type { BillingSubscription } from './billingSubscription.model.js'

export interface BillingContractAttributes extends BaseAttributes {
  billingAccountId: string
  unitId: string
  contractNumber: string
  contractType: ContractType
  startDate: Date | string
  endDate?: Date | string | null
  billingFrequency: BillingCycle
  status: ContractStatus
  notes?: string | null
  isActive?: boolean
}

export type BillingContractCreationAttributes = Optional<
  BillingContractAttributes,
  | 'id'
  | 'contractType'
  | 'endDate'
  | 'billingFrequency'
  | 'status'
  | 'notes'
  | 'isActive'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class BillingContract
  extends BaseModel<BillingContractAttributes, BillingContractCreationAttributes>
  implements BillingContractAttributes
{
  declare billingAccountId: string
  declare unitId: string
  declare contractNumber: string
  declare contractType: ContractType
  declare startDate: Date | string
  declare endDate: Date | string | null
  declare billingFrequency: BillingCycle
  declare status: ContractStatus
  declare notes: string | null
  declare isActive: boolean

  // Associations
  declare billingAccount?: BillingAccount
  declare unit?: PropertyUnit
  declare subscriptions?: BillingSubscription[]
}

BillingContract.init(
  {
    ...baseModelColumns,
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
      defaultValue: ContractType.STANDARD,
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
      defaultValue: BillingCycle.MONTHLY,
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'),
      allowNull: false,
      defaultValue: ContractStatus.DRAFT,
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
  },
  {
    sequelize,
    tableName: 'billing_contracts',
    timestamps: true,
  },
)

export default BillingContract
