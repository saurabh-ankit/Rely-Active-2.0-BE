import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Property } from './property.model.js'
import type { AdditionalTaskCharge } from './additionalTaskCharge.model.js'
import type { PackageSubscriptionFeature } from './packageSubscriptionFeature.model.js'
import type { Package } from './package.model.js'
import type { CarePackageFeaturesMap } from './carePackageFeaturesMap.model.js'

export type BillingType = 'MONTHLY' | 'SESSION'

export interface CareTaskAttributes extends BaseAttributes {
  careTaskName: string
  careTaskDescription?: string | null
  billingType: BillingType | string
  price: number
  careTaskImage?: string | null
  propertyId?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type CareTaskCreationAttributes = Optional<
  CareTaskAttributes,
  | 'id'
  | 'careTaskDescription'
  | 'billingType'
  | 'price'
  | 'careTaskImage'
  | 'propertyId'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class CareTask extends BaseModel<CareTaskAttributes, CareTaskCreationAttributes> implements CareTaskAttributes {
  declare careTaskName: string
  declare careTaskDescription: string | null
  declare billingType: BillingType | string
  declare price: number
  declare careTaskImage: string | null
  declare propertyId: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare property?: Property
  declare additionalTaskCharges?: AdditionalTaskCharge[]
  declare packageSubscriptionFeatures?: PackageSubscriptionFeature[]
  declare packages?: (Package & { CarePackageFeaturesMap?: CarePackageFeaturesMap })[]
  declare packageMaps?: CarePackageFeaturesMap[]
}

CareTask.init(
  {
    ...baseModelColumns,
    careTaskName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    careTaskDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    billingType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'MONTHLY',
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('price')
        return val !== null && val !== undefined ? Number(val) : 0
      },
    },
    careTaskImage: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    propertyId: {
      type: DataTypes.UUID,
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
    tableName: 'care_tasks',
    timestamps: true,
  },
)

export default CareTask
