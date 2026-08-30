import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { CalibrationResult, InspectionType } from '../enums/asset/index.js'

export interface AssetComplianceInspectionAttributes extends BaseAttributes {
  assetId: string
  inspectionType: InspectionType
  inspectorName?: string | null
  inspectionDate: Date
  nextInspectionDate?: Date | null
  result: CalibrationResult
  findings?: string | null
  recommendations?: string | null
  documentUrl?: string | null
}

export type AssetComplianceInspectionCreationAttributes = Optional<
  AssetComplianceInspectionAttributes,
  | 'id'
  | 'inspectorName'
  | 'nextInspectionDate'
  | 'findings'
  | 'recommendations'
  | 'documentUrl'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AssetComplianceInspection
  extends BaseModel<AssetComplianceInspectionAttributes, AssetComplianceInspectionCreationAttributes>
  implements AssetComplianceInspectionAttributes
{
  declare assetId: string
  declare inspectionType: InspectionType
  declare inspectorName: string | null
  declare inspectionDate: Date
  declare nextInspectionDate: Date | null
  declare result: CalibrationResult
  declare findings: string | null
  declare recommendations: string | null
  declare documentUrl: string | null
}

AssetComplianceInspection.init(
  {
    ...baseModelColumns,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    inspectionType: {
      type: DataTypes.ENUM(...Object.values(InspectionType)),
      allowNull: false,
    },
    inspectorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    inspectionDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    nextInspectionDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    result: {
      type: DataTypes.ENUM(...Object.values(CalibrationResult)),
      allowNull: false,
    },
    findings: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    recommendations: {
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
    tableName: 'asset_compliance_inspections',
    timestamps: true,
  },
)

export default AssetComplianceInspection
