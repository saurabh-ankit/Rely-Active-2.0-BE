import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Property } from './property.model.js'
import type { PackageSubscription } from './packageSubscription.model.js'
import type { CareTask } from './careTasks.model.js'
import type { CarePackageFeaturesMap } from './carePackageFeaturesMap.model.js'

export type PackageDuration = 'Monthly' | 'Yearly'

export interface PackageTaskItem {
  taskId: string
  careTaskName?: string
  taskName?: string
  taskType?: string
  billingType?: string
  price?: number
  careTaskImage?: string | null
  taskImage?: string | null
  complimentaryCount: number
}

export interface PackageAttributes extends BaseAttributes {
  packageName: string
  packageCost: number
  duration: PackageDuration | string
  description?: string | null
  propertyId?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type PackageCreationAttributes = Optional<
  PackageAttributes,
  'id' | 'description' | 'propertyId' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class Package extends BaseModel<PackageAttributes, PackageCreationAttributes> implements PackageAttributes {
  declare packageName: string
  declare packageCost: number
  declare duration: PackageDuration | string
  declare description: string | null
  declare propertyId: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare property?: Property
  declare packageSubscriptions?: PackageSubscription[]
  declare features?: (CareTask & { CarePackageFeaturesMap?: CarePackageFeaturesMap })[]
  declare featureMaps?: CarePackageFeaturesMap[]
  declare featureMappings?: CarePackageFeaturesMap[]
}

Package.init(
  {
    ...baseModelColumns,
    packageName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    packageCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('packageCost')
        return val !== null && val !== undefined ? Number(val) : 0
      },
    },
    duration: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Monthly',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'packages',
    timestamps: true,
  },
)

export default Package
