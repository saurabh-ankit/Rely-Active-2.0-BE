import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { SubscriptionStatus } from '../enums/packageSubscription.enum.js'

import type { Resident } from './resident.model.js'
import type { Package } from './package.model.js'
import type { Property } from './property.model.js'
import type { PackageSubscriptionFeature } from './packageSubscriptionFeature.model.js'

export { SubscriptionStatus }

export interface PackageSubscriptionAttributes extends BaseAttributes {
  residentId: string
  carePackageId: string
  status: SubscriptionStatus
  startDate: Date | string
  endDate?: Date | string | null
  totalCost?: number | null
  notes?: string | null
  propertyId: string
  isPrevious?: boolean
  isActive?: boolean
  isDeleted?: boolean
}

export type PackageSubscriptionCreationAttributes = Optional<
  PackageSubscriptionAttributes,
  | 'id'
  | 'status'
  | 'endDate'
  | 'totalCost'
  | 'notes'
  | 'isPrevious'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class PackageSubscription
  extends BaseModel<PackageSubscriptionAttributes, PackageSubscriptionCreationAttributes>
  implements PackageSubscriptionAttributes
{
  declare residentId: string
  declare carePackageId: string
  declare status: SubscriptionStatus
  declare startDate: Date | string
  declare endDate: Date | string | null
  declare totalCost: number | null
  declare notes: string | null
  declare propertyId: string
  declare isPrevious: boolean
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare carePackage?: Package
  declare property?: Property
  declare packageSubscriptionFeatures?: PackageSubscriptionFeature[]
  declare features?: PackageSubscriptionFeature[]
}

PackageSubscription.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    carePackageId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> packages.id',
    },
    status: {
      type: DataTypes.ENUM(...Object.values(SubscriptionStatus)),
      allowNull: false,
      defaultValue: SubscriptionStatus.ACTIVE,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('totalCost')
        return val !== null && val !== undefined ? Number(val) : null
      },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> properties.id',
    },
    isPrevious: {
      type: DataTypes.BOOLEAN,
      field: 'previous',
      allowNull: false,
      defaultValue: false,
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
    tableName: 'package_subscriptions',
    timestamps: true,
  },
)

export default PackageSubscription
