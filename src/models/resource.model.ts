import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface ResourceAttributes extends BaseAttributes {
  key: string
  name: string
  description?: string | null
  /** Display order among siblings (modules, or a module's sub-modules). */
  sortOrder?: number
  /** When this resource's starting grants were applied by the catalogue sync. */
  grantsAppliedAt?: Date | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ResourceCreationAttributes = Optional<
  ResourceAttributes,
  | 'id'
  | 'description'
  | 'sortOrder'
  | 'grantsAppliedAt'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Resource extends BaseModel<ResourceAttributes, ResourceCreationAttributes> implements ResourceAttributes {
  declare key: string
  declare name: string
  declare description: string | null
  declare sortOrder: number
  declare grantsAppliedAt: Date | null
  declare isActive: boolean
  declare isDeleted: boolean
}

Resource.init(
  {
    ...baseModelColumns,
    key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    grantsAppliedAt: {
      type: DataTypes.DATE,
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
    tableName: 'resources',
    timestamps: true,
  },
)

export default Resource
