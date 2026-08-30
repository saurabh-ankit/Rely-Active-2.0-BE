import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AssetComplianceTrainingAttributes extends BaseAttributes {
  assetId: string
  trainingTitle: string
  requiredFor: 'employee' | 'patient' | 'all'
  validityPeriod?: number | null
  notes?: string | null
}

export type AssetComplianceTrainingCreationAttributes = Optional<
  AssetComplianceTrainingAttributes,
  'id' | 'validityPeriod' | 'notes' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetComplianceTraining
  extends BaseModel<AssetComplianceTrainingAttributes, AssetComplianceTrainingCreationAttributes>
  implements AssetComplianceTrainingAttributes
{
  declare assetId: string
  declare trainingTitle: string
  declare requiredFor: 'employee' | 'patient' | 'all'
  declare validityPeriod: number | null
  declare notes: string | null
}

AssetComplianceTraining.init(
  {
    ...baseModelColumns,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    trainingTitle: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    requiredFor: {
      type: DataTypes.ENUM('employee', 'patient', 'all'),
      allowNull: false,
    },
    validityPeriod: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_compliance_training',
    timestamps: true,
  },
)

export default AssetComplianceTraining
