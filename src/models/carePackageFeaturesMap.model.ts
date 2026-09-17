import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Package } from './package.model.js'
import type { CareTask } from './careTasks.model.js'

export interface CarePackageFeaturesMapAttributes extends BaseAttributes {
  carePackageId: string
  featureId: string
  complimentaryCount: number
  isActive?: boolean
  isDeleted?: boolean
}

export type CarePackageFeaturesMapCreationAttributes = Optional<
  CarePackageFeaturesMapAttributes,
  'id' | 'complimentaryCount' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class CarePackageFeaturesMap
  extends BaseModel<CarePackageFeaturesMapAttributes, CarePackageFeaturesMapCreationAttributes>
  implements CarePackageFeaturesMapAttributes
{
  declare carePackageId: string
  declare featureId: string
  declare complimentaryCount: number
  declare isActive: boolean
  declare isDeleted: boolean

  declare carePackage?: Package
  declare feature?: CareTask
}

CarePackageFeaturesMap.init(
  {
    ...baseModelColumns,
    carePackageId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> packages.id',
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
    tableName: 'care_package_features_map',
    timestamps: true,
  },
)

export default CarePackageFeaturesMap
