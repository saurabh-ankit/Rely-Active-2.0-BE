import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { WarrantyType } from '../enums/asset.enum.js'

export interface AssetWarrantyAttributes extends BaseAttributes {
  assetId: string
  vendorId?: string | null
  warrantyStartDate: Date
  warrantyEndDate: Date
  warrantyType: WarrantyType
  coverageDetails?: string | null
  documentUrl?: string | null
}

export type AssetWarrantyCreationAttributes = Optional<
  AssetWarrantyAttributes,
  'id' | 'vendorId' | 'coverageDetails' | 'documentUrl' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetWarranty
  extends BaseModel<AssetWarrantyAttributes, AssetWarrantyCreationAttributes>
  implements AssetWarrantyAttributes
{
  declare assetId: string
  declare vendorId: string | null
  declare warrantyStartDate: Date
  declare warrantyEndDate: Date
  declare warrantyType: WarrantyType
  declare coverageDetails: string | null
  declare documentUrl: string | null
}

AssetWarranty.init(
  {
    ...baseModelColumns,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    warrantyStartDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    warrantyEndDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    warrantyType: {
      type: DataTypes.ENUM(...Object.values(WarrantyType)),
      allowNull: false,
    },
    coverageDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    documentUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_warranties',
    timestamps: true,
  },
)

export default AssetWarranty
