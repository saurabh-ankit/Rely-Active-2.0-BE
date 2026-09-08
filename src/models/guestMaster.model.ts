import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface GuestMasterAttributes {
  id: string
  locId: string
  unitId: string
  name: string
  phone?: string | null
  notes?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type GuestMasterCreationAttributes = Optional<GuestMasterAttributes, 'id' | 'createdAt' | 'updatedAt'>

export class GuestMaster
  extends Model<GuestMasterAttributes, GuestMasterCreationAttributes>
  implements GuestMasterAttributes
{
  declare id: string
  declare locId: string
  declare unitId: string
  declare name: string
  declare phone: string | null
  declare notes: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

GuestMaster.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'guest_masters',
    timestamps: true,
  },
)
