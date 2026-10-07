import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AdvertisementAttributes extends BaseAttributes {
  locationId: string
  title: string
  description?: string | null
  imageUrl: string
  isActive: boolean
  isDeleted: boolean
}

export type AdvertisementCreationAttributes = Optional<
  AdvertisementAttributes,
  'id' | 'description' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class Advertisement
  extends BaseModel<AdvertisementAttributes, AdvertisementCreationAttributes>
  implements AdvertisementAttributes
{
  declare locationId: string
  declare title: string
  declare description: string | null
  declare imageUrl: string
  declare isActive: boolean
  declare isDeleted: boolean
}

Advertisement.init(
  {
    ...baseModelColumns,
    locationId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    imageUrl: { type: DataTypes.STRING(500), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'advertisements', timestamps: true },
)

export default Advertisement
