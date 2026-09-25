import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { BillingCycle, ProrationPolicy, SubscriptionStatus } from '../enums/billing.enum.js'

import type { BillingAccount } from './billingAccount.model.js'
import type { BillingProduct } from './billingProduct.model.js'
import type { BillingPricePlan } from './billingPricePlan.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'
import type { FnbResidentPackage } from './fnbResidentPackage.model.js'

export interface BillingSubscriptionAttributes extends BaseAttributes {
  billingAccountId: string
  unitId: string
  productId: string
  pricePlanId?: string | null
  description?: string | null
  quantity: number
  unitPrice: number
  billingFrequency: BillingCycle
  prorationPolicy: ProrationPolicy
  startDate: Date | string
  endDate?: Date | string | null
  fnbPackageId?: string | null
  status: SubscriptionStatus
  pauseStart?: Date | string | null
  pauseEnd?: Date | string | null
  isActive?: boolean
}

export type BillingSubscriptionCreationAttributes = Optional<
  BillingSubscriptionAttributes,
  | 'id'
  | 'pricePlanId'
  | 'description'
  | 'quantity'
  | 'billingFrequency'
  | 'prorationPolicy'
  | 'endDate'
  | 'fnbPackageId'
  | 'status'
  | 'pauseStart'
  | 'pauseEnd'
  | 'isActive'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class BillingSubscription
  extends BaseModel<BillingSubscriptionAttributes, BillingSubscriptionCreationAttributes>
  implements BillingSubscriptionAttributes
{
  declare billingAccountId: string
  declare unitId: string
  declare productId: string
  declare pricePlanId: string | null
  declare description: string | null
  declare quantity: number
  declare unitPrice: number
  declare billingFrequency: BillingCycle
  declare prorationPolicy: ProrationPolicy
  declare startDate: Date | string
  declare endDate: Date | string | null
  declare fnbPackageId: string | null
  declare status: SubscriptionStatus
  declare pauseStart: Date | string | null
  declare pauseEnd: Date | string | null
  declare isActive: boolean

  // Associations
  declare billingAccount?: BillingAccount
  declare product?: BillingProduct
  declare pricePlan?: BillingPricePlan
  declare unit?: PropertyUnit
  declare fnbPackage?: FnbResidentPackage
}

BillingSubscription.init(
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
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    pricePlanId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 1.0,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    billingFrequency: {
      type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL'),
      allowNull: false,
      defaultValue: BillingCycle.MONTHLY,
    },
    prorationPolicy: {
      type: DataTypes.ENUM('DAILY', 'FULL_MONTH', 'NO_PRORATION'),
      allowNull: false,
      defaultValue: ProrationPolicy.DAILY,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    fnbPackageId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'),
      allowNull: false,
      defaultValue: SubscriptionStatus.ACTIVE,
    },
    pauseStart: {
      type: DataTypes.DATEONLY,
      allowNull: true,
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
  },
  {
    sequelize,
    tableName: 'billing_subscriptions',
    timestamps: true,
  },
)

export default BillingSubscription
