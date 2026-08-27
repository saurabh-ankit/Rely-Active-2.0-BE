import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface UserPropertyAttributes {
  id: string
  user_id: string
  property_id: string
  createdAt?: Date
  updatedAt?: Date
}

export type UserPropertyCreationAttributes = Optional<UserPropertyAttributes, 'id' | 'createdAt' | 'updatedAt'>

export class UserProperty
  extends Model<UserPropertyAttributes, UserPropertyCreationAttributes>
  implements UserPropertyAttributes
{
  declare id: string
  declare user_id: string
  declare property_id: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

UserProperty.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    property_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'user_properties',
    timestamps: true,
  },
)

export default UserProperty
