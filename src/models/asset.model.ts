import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { AssetCondition, AssetStatus } from '../enums/asset/index.js'

export interface AssetAttributes extends BaseAttributes {
  itemId: string
  locationId: string
  vendorId?: string | null
  serialNumber?: string | null
  assetTag?: string | null
  qrCode?: string | null
  purchaseDate?: Date | null
  purchasePrice?: number | null
  currentValue?: number | null
  warrantyEndDate?: Date | null
  warrantyDocumentUrl?: string | null
  condition: AssetCondition
  status: AssetStatus
  notes?: string | null
}

export type AssetCreationAttributes = Optional<
  AssetAttributes,
  | 'id'
  | 'vendorId'
  | 'serialNumber'
  | 'assetTag'
  | 'qrCode'
  | 'purchaseDate'
  | 'purchasePrice'
  | 'currentValue'
  | 'warrantyEndDate'
  | 'warrantyDocumentUrl'
  | 'notes'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Asset extends BaseModel<AssetAttributes, AssetCreationAttributes> implements AssetAttributes {
  declare itemId: string
  declare locationId: string
  declare vendorId: string | null
  declare serialNumber: string | null
  declare assetTag: string | null
  declare qrCode: string | null
  declare purchaseDate: Date | null
  declare purchasePrice: number | null
  declare currentValue: number | null
  declare warrantyEndDate: Date | null
  declare warrantyDocumentUrl: string | null
  declare condition: AssetCondition
  declare status: AssetStatus
  declare notes: string | null
}

Asset.init(
  {
    ...baseModelColumns,
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    serialNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    assetTag: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    qrCode: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    purchaseDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    purchasePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    currentValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    warrantyEndDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    warrantyDocumentUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    condition: {
      type: DataTypes.ENUM(...Object.values(AssetCondition)),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(AssetStatus)),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'assets',
    timestamps: true,
  },
)

export default Asset
