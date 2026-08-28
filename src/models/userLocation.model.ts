import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface UserLocationAttributes extends BaseAttributes {
  userId: string
  locId: string
}

export type UserLocationCreationAttributes = Optional<
  UserLocationAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class UserLocation
  extends BaseModel<UserLocationAttributes, UserLocationCreationAttributes>
  implements UserLocationAttributes
{
  declare userId: string
  declare locId: string
}

UserLocation.init(
  {
    ...baseModelColumns,
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'user_locations',
    timestamps: true,
  },
)

export default UserLocation
