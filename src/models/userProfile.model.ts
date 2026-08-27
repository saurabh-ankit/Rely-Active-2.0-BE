import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface UserProfileAttributes {
  id: string
  user_id: string
  first_name: string
  last_name?: string | null
  gender?: string | null
  date_of_birth?: string | null
  photo_url?: string | null
  designation?: string | null
  employee_code?: string | null
  emergency_contact?: string | null
  blood_group?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type UserProfileCreationAttributes = Optional<
  UserProfileAttributes,
  | 'id'
  | 'last_name'
  | 'gender'
  | 'date_of_birth'
  | 'photo_url'
  | 'designation'
  | 'employee_code'
  | 'emergency_contact'
  | 'blood_group'
  | 'createdAt'
  | 'updatedAt'
>

export class UserProfile
  extends Model<UserProfileAttributes, UserProfileCreationAttributes>
  implements UserProfileAttributes
{
  declare id: string
  declare user_id: string
  declare first_name: string
  declare last_name: string | null
  declare gender: string | null
  declare date_of_birth: string | null
  declare photo_url: string | null
  declare designation: string | null
  declare employee_code: string | null
  declare emergency_contact: string | null
  declare blood_group: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

UserProfile.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      unique: true,
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    photo_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    designation: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    employee_code: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    emergency_contact: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    blood_group: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'user_profiles',
    timestamps: true,
  },
)

export default UserProfile
