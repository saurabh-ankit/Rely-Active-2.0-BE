import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { PackageSubscription } from './packageSubscription.model.js'
import type { CareTask } from './careTasks.model.js'

export interface PackageSubscriptionFeatureAttributes extends BaseAttributes {
  packageSubscriptionId: string
  featureId: string
  complimentaryCount: number
  remainingCount: number
  isActive?: boolean
  isDeleted?: boolean
}

export type PackageSubscriptionFeatureCreationAttributes = Optional<
  PackageSubscriptionFeatureAttributes,
  | 'id'
  | 'complimentaryCount'
  | 'remainingCount'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class PackageSubscriptionFeature
  extends BaseModel<PackageSubscriptionFeatureAttributes, PackageSubscriptionFeatureCreationAttributes>
  implements PackageSubscriptionFeatureAttributes
{
  declare packageSubscriptionId: string
  declare featureId: string
  declare complimentaryCount: number
  declare remainingCount: number
  declare isActive: boolean
  declare isDeleted: boolean

  declare subscription?: PackageSubscription
  declare feature?: CareTask
}

PackageSubscriptionFeature.init(
  {
    ...baseModelColumns,
    packageSubscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> package_subscriptions.id',
    },
    featureId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> care_tasks.id',
    },
    complimentaryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    remainingCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'package_subscription_features',
    timestamps: true,
  },
)

export default PackageSubscriptionFeature
