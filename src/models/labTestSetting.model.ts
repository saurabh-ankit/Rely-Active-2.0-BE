import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface LabTestSettingAttributes extends BaseAttributes {
  name: string
  description: string
  instructions?: string | null
  imageUrl?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type LabTestSettingCreationAttributes = Optional<
  LabTestSettingAttributes,
  'id' | 'instructions' | 'imageUrl' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class LabTestSetting
  extends BaseModel<LabTestSettingAttributes, LabTestSettingCreationAttributes>
  implements LabTestSettingAttributes
{
  declare name: string
  declare description: string
  declare instructions: string | null
  declare imageUrl: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

LabTestSetting.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
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
    tableName: 'lab_test_settings',
    timestamps: true,
    indexes: [
      { fields: ['name'], name: 'lab_test_settings_name_idx' },
      { fields: ['isActive', 'isDeleted'], name: 'lab_test_settings_active_idx' },
    ],
  },
)

export default LabTestSetting
