import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { BillingProductCategory, ChargeType } from '../enums/billing.enum.js'

import type { Company } from './company.model.js'
import type { BillingPricePlan } from './billingPricePlan.model.js'
import type { BillingSubscription } from './billingSubscription.model.js'

export interface BillingProductAttributes extends BaseAttributes {
  companyId: string
  productCode: string
  productName: string
  category: BillingProductCategory
  chargeType: ChargeType
  unitLabel?: string | null
  isTaxable: boolean
  defaultTaxRate: number
  description?: string | null
  isActive?: boolean
}

export type BillingProductCreationAttributes = Optional<
  BillingProductAttributes,
  | 'id'
  | 'unitLabel'
  | 'isTaxable'
  | 'defaultTaxRate'
  | 'description'
  | 'isActive'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class BillingProduct
  extends BaseModel<BillingProductAttributes, BillingProductCreationAttributes>
  implements BillingProductAttributes
{
  declare companyId: string
  declare productCode: string
  declare productName: string
  declare category: BillingProductCategory
  declare chargeType: ChargeType
  declare unitLabel: string | null
  declare isTaxable: boolean
  declare defaultTaxRate: number
  declare description: string | null
  declare isActive: boolean

  // Associations
  declare company?: Company
  declare pricePlans?: BillingPricePlan[]
  declare subscriptions?: BillingSubscription[]
}

BillingProduct.init(
  {
    ...baseModelColumns,
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> company.id',
    },
    productCode: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
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
    },
    unitLabel: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'unit',
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
  },
  {
    sequelize,
    tableName: 'billing_products',
    timestamps: true,
  },
)

export default BillingProduct
