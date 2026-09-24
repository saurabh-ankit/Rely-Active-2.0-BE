import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export const VITAL_INPUT_TYPES = ['single', 'composite'] as const
export type VitalInputType = (typeof VITAL_INPUT_TYPES)[number]

export interface VitalSettingAttributes extends BaseAttributes {
  name: string
  code?: string | null
  description?: string | null
  imageUrl: string
  unit: string
  inputType: VitalInputType
  lowRiskyBelow?: number | null
  lowBelow?: number | null
  normalMin?: number | null
  normalMax?: number | null
  highAbove?: number | null
  highRiskyAbove?: number | null
  isActive: boolean
  isDeleted: boolean
}

export type VitalSettingCreationAttributes = Optional<
  VitalSettingAttributes,
  | 'id'
  | 'code'
  | 'description'
  | 'inputType'
  | 'lowRiskyBelow'
  | 'lowBelow'
  | 'normalMin'
  | 'normalMax'
  | 'highAbove'
  | 'highRiskyAbove'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class VitalSetting
  extends BaseModel<VitalSettingAttributes, VitalSettingCreationAttributes>
  implements VitalSettingAttributes
{
  declare name: string
  declare code: string | null
  declare description: string | null
  declare imageUrl: string
  declare unit: string
  declare inputType: VitalInputType
  declare lowRiskyBelow: number | null
  declare lowBelow: number | null
  declare normalMin: number | null
  declare normalMax: number | null
  declare highAbove: number | null
  declare highRiskyAbove: number | null
  declare isActive: boolean
  declare isDeleted: boolean
}

VitalSetting.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    inputType: {
      type: DataTypes.ENUM(...VITAL_INPUT_TYPES),
      allowNull: false,
      defaultValue: 'single',
    },
    lowRiskyBelow: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    lowBelow: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    normalMin: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    normalMax: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    highAbove: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    highRiskyAbove: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'vital_settings',
    timestamps: true,
    indexes: [
      { fields: ['name'], name: 'vital_settings_name_idx' },
      { fields: ['isActive', 'isDeleted'], name: 'vital_settings_active_idx' },
    ],
  },
)

export default VitalSetting
