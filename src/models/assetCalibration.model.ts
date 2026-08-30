import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { CalibrationResult } from '../enums/asset/index.js'

export interface AssetCalibrationAttributes extends BaseAttributes {
  assetId: string
  calibrationDate: Date
  nextCalibrationDate?: Date | null
  calibratedBy?: string | null
  certificateNumber?: string | null
  result: CalibrationResult
  notes?: string | null
  documentUrl?: string | null
}

export type AssetCalibrationCreationAttributes = Optional<
  AssetCalibrationAttributes,
  | 'id'
  | 'nextCalibrationDate'
  | 'calibratedBy'
  | 'certificateNumber'
  | 'notes'
  | 'documentUrl'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AssetCalibration
  extends BaseModel<AssetCalibrationAttributes, AssetCalibrationCreationAttributes>
  implements AssetCalibrationAttributes
{
  declare assetId: string
  declare calibrationDate: Date
  declare nextCalibrationDate: Date | null
  declare calibratedBy: string | null
  declare certificateNumber: string | null
  declare result: CalibrationResult
  declare notes: string | null
  declare documentUrl: string | null
}

AssetCalibration.init(
  {
    ...baseModelColumns,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    calibrationDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    nextCalibrationDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    calibratedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    certificateNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    result: {
      type: DataTypes.ENUM(...Object.values(CalibrationResult)),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'remarks',
    },
    documentUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_calibrations',
    timestamps: true,
  },
)

export default AssetCalibration
