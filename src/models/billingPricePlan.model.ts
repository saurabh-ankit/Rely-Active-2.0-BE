import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { BillingProduct } from './billingProduct.model.js'
import type { Property } from './property.model.js'

export interface BillingPricePlanAttributes extends BaseAttributes {
  productId: string
  propertyId: string
  planCode: string
  planName: string
  unitPrice: number
  currency: string
  effectiveFrom: Date | string
  effectiveTo?: Date | string | null
  isActive?: boolean
}

export type BillingPricePlanCreationAttributes = Optional<
  BillingPricePlanAttributes,
  'id' | 'currency' | 'effectiveTo' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class BillingPricePlan
  extends BaseModel<BillingPricePlanAttributes, BillingPricePlanCreationAttributes>
  implements BillingPricePlanAttributes
{
  declare productId: string
  declare propertyId: string
  declare planCode: string
  declare planName: string
  declare unitPrice: number
  declare currency: string
  declare effectiveFrom: Date | string
  declare effectiveTo: Date | string | null
  declare isActive: boolean

  // Associations
  declare product?: BillingProduct
  declare property?: Property
}

BillingPricePlan.init(
  {
    ...baseModelColumns,
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
    },
    planName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    effectiveFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
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
  },
  {
    sequelize,
    tableName: 'billing_price_plans',
    timestamps: true,
  },
)

export default BillingPricePlan
