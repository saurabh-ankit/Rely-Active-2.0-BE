import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface VenueImage {
  url: string
  caption?: string
}

export interface AddOnService {
  globalServiceId?: string
  name: string
  imageUrl?: string
  keyFeatures?: string
  price?: number
  quantity?: number
}

export interface EventVenueAttributes extends BaseAttributes {
  name: string
  occupancy: number
  price: number
  keyFeatures: string
  otherServices?: string | null
  coverPhoto?: string | null
  images?: VenueImage[] | null
  addOnServices?: AddOnService[] | null
  locationId: string
  isActive: boolean
  isDeleted: boolean
}

export type EventVenueCreationAttributes = Optional<
  EventVenueAttributes,
  | 'id'
  | 'price'
  | 'otherServices'
  | 'coverPhoto'
  | 'images'
  | 'addOnServices'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class EventVenue
  extends BaseModel<EventVenueAttributes, EventVenueCreationAttributes>
  implements EventVenueAttributes
{
  declare name: string
  declare occupancy: number
  declare price: number
  declare keyFeatures: string
  declare otherServices: string | null
  declare coverPhoto: string | null
  declare images: VenueImage[] | null
  declare addOnServices: AddOnService[] | null
  declare locationId: string
  declare isActive: boolean
  declare isDeleted: boolean
}

EventVenue.init(
  {
    ...baseModelColumns,
    name: { type: DataTypes.STRING(255), allowNull: false },
    occupancy: { type: DataTypes.INTEGER, allowNull: false },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('price')
        return val !== null ? Number(val) : 0
      },
    },
    keyFeatures: { type: DataTypes.TEXT, allowNull: false },
    otherServices: { type: DataTypes.TEXT, allowNull: true },
    coverPhoto: { type: DataTypes.STRING(500), allowNull: true },
    images: { type: DataTypes.JSON, allowNull: true },
    addOnServices: { type: DataTypes.JSON, allowNull: true },
    locationId: { type: DataTypes.UUID, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'event_venues', timestamps: true },
)

export default EventVenue
