import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'

/** A non-residing family member who looks after the residents of a flat from the resident app. */
export interface ResidentGuardianAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  firstName: string
  lastName?: string | null
  relation: string
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null
  phone: string
  email?: string | null
  address?: string | null
  photoUrl?: string | null
  username: string
  passwordHash: string
  lastLoginAt?: Date | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentGuardianCreationAttributes = Optional<
  ResidentGuardianAttributes,
  | 'id'
  | 'lastName'
  | 'gender'
  | 'email'
  | 'address'
  | 'photoUrl'
  | 'lastLoginAt'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentGuardian
  extends BaseModel<ResidentGuardianAttributes, ResidentGuardianCreationAttributes>
  implements ResidentGuardianAttributes
{
  declare residentId: string
  declare locationId: string
  declare firstName: string
  declare lastName: string | null
  declare relation: string
  declare gender: 'MALE' | 'FEMALE' | 'OTHER' | null
  declare phone: string
  declare email: string | null
  declare address: string | null
  declare photoUrl: string | null
  declare username: string
  declare passwordHash: string
  declare lastLoginAt: Date | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
}

ResidentGuardian.init(
  {
    ...baseModelColumns,
    residentId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> residents.id (the flat)' },
    locationId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> properties.id' },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: true },
    relation: { type: DataTypes.STRING(50), allowNull: false },
    gender: { type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    photoUrl: { type: DataTypes.TEXT('long'), allowNull: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'resident_guardians',
    timestamps: true,
  },
)

export default ResidentGuardian
