import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'

export interface ResidentNokContactAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  fullName: string
  relationship?: string | null
  phone: string
  alternatePhone?: string | null
  email?: string | null
  address?: string | null
  photoUrl?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentNokContactCreationAttributes = Optional<
  ResidentNokContactAttributes,
  | 'id'
  | 'relationship'
  | 'alternatePhone'
  | 'email'
  | 'address'
  | 'photoUrl'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentNokContact
  extends BaseModel<ResidentNokContactAttributes, ResidentNokContactCreationAttributes>
  implements ResidentNokContactAttributes
{
  declare residentId: string
  declare locationId: string
  declare fullName: string
  declare relationship: string | null
  declare phone: string
  declare alternatePhone: string | null
  declare email: string | null
  declare address: string | null
  declare photoUrl: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
}

ResidentNokContact.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> properties.id',
    },
    fullName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    relationship: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    alternatePhone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'resident_nok_contacts',
    timestamps: true,
    indexes: [
      { fields: ['residentId'], name: 'idx_resident_nok_contacts_resident' },
      { fields: ['isDeleted', 'createdAt'], name: 'idx_resident_nok_contacts_deleted_created' },
    ],
  },
)

export default ResidentNokContact
