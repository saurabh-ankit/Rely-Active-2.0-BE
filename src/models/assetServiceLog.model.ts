import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { ServiceType } from '../enums/asset.enum.js'

export interface AssetServiceLogAttributes extends BaseAttributes {
  assetId: string
  serviceDate: Date
  serviceType: ServiceType
  performedBy?: string | null
  vendorId?: string | null
  cost?: number | null
  description?: string | null
  nextServiceDate?: Date | null
  completionStatus: 'pending' | 'completed'
  completedDate?: Date | null
  completionRemarks?: string | null
}

export type AssetServiceLogCreationAttributes = Optional<
  AssetServiceLogAttributes,
  | 'id'
  | 'performedBy'
  | 'vendorId'
  | 'cost'
  | 'description'
  | 'nextServiceDate'
  | 'completedDate'
  | 'completionRemarks'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AssetServiceLog
  extends BaseModel<AssetServiceLogAttributes, AssetServiceLogCreationAttributes>
  implements AssetServiceLogAttributes
{
  declare assetId: string
  declare serviceDate: Date
  declare serviceType: ServiceType
  declare performedBy: string | null
  declare vendorId: string | null
  declare cost: number | null
  declare description: string | null
  declare nextServiceDate: Date | null
  declare completionStatus: 'pending' | 'completed'
  declare completedDate: Date | null
  declare completionRemarks: string | null
}

AssetServiceLog.init(
  {
    ...baseModelColumns,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    serviceDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    serviceType: {
      type: DataTypes.ENUM(...Object.values(ServiceType)),
      allowNull: false,
    },
    performedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    nextServiceDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completionStatus: {
      type: DataTypes.ENUM('pending', 'completed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    completedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completionRemarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_service_logs',
    timestamps: true,
  },
)

export default AssetServiceLog
