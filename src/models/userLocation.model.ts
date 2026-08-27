import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface UserLocationAttributes {
  id: string
  userId: string
  locationId: string
  isActive?: boolean
  isDeleted?: boolean
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type UserLocationCreationAttributes = Optional<
  UserLocationAttributes,
  'id' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class UserLocation
  extends Model<UserLocationAttributes, UserLocationCreationAttributes>
  implements UserLocationAttributes
{
  declare id: string
  declare userId: string
  declare locationId: string
  declare isActive: boolean
  declare isDeleted: boolean
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

UserLocation.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    locationId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
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
    createdBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'user_locations',
    timestamps: true,
  },
)

export default UserLocation
