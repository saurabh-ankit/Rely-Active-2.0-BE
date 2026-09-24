import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface GstTaxSettingsAttributes extends BaseAttributes {
  gstEnabled: boolean
  defaultGstRate: number
  cgstRate: number
  sgstRate: number
  companyGstNumber?: string | null
}

export type GstTaxSettingsCreationAttributes = Optional<
  GstTaxSettingsAttributes,
  | 'id'
  | 'gstEnabled'
  | 'defaultGstRate'
  | 'cgstRate'
  | 'sgstRate'
  | 'companyGstNumber'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class GstTaxSettings
  extends BaseModel<GstTaxSettingsAttributes, GstTaxSettingsCreationAttributes>
  implements GstTaxSettingsAttributes
{
  declare gstEnabled: boolean
  declare defaultGstRate: number
  declare cgstRate: number
  declare sgstRate: number
  declare companyGstNumber: string | null
}

GstTaxSettings.init(
  {
    ...baseModelColumns,
    gstEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    defaultGstRate: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 18.0,
    },
    cgstRate: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 9.0,
    },
    sgstRate: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 9.0,
    },
    companyGstNumber: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'gst_tax_settings',
    timestamps: true,
  },
)

export default GstTaxSettings
