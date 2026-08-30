import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AssetVendorAttributes extends BaseAttributes {
  name: string
  categoryId: string
  contactPerson?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  website?: string | null
  taxId?: string | null
}

export type AssetVendorCreationAttributes = Optional<
  AssetVendorAttributes,
  | 'id'
  | 'contactPerson'
  | 'email'
  | 'phone'
  | 'address'
  | 'website'
  | 'taxId'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AssetVendor
  extends BaseModel<AssetVendorAttributes, AssetVendorCreationAttributes>
  implements AssetVendorAttributes
{
  declare name: string
  declare categoryId: string
  declare contactPerson: string | null
  declare email: string | null
  declare phone: string | null
  declare address: string | null
  declare website: string | null
  declare taxId: string | null
}

AssetVendor.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    contactPerson: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    taxId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_vendors',
    timestamps: true,
  },
)

export default AssetVendor
