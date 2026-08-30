import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'bool' | 'document'

export interface AssetVendorCustomFieldAttributes extends BaseAttributes {
  vendorId: string
  fieldName: string
  fieldLabel: string
  fieldType: FieldType
  fieldValue?: string | null
  enumValues?: string[] | null
  displayOrder: number
  defaultValue?: string | null
}

export type AssetVendorCustomFieldCreationAttributes = Optional<
  AssetVendorCustomFieldAttributes,
  'id' | 'fieldValue' | 'enumValues' | 'defaultValue' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetVendorCustomField
  extends BaseModel<AssetVendorCustomFieldAttributes, AssetVendorCustomFieldCreationAttributes>
  implements AssetVendorCustomFieldAttributes
{
  declare vendorId: string
  declare fieldName: string
  declare fieldLabel: string
  declare fieldType: FieldType
  declare fieldValue: string | null
  declare enumValues: string[] | null
  declare displayOrder: number
  declare defaultValue: string | null
}

AssetVendorCustomField.init(
  {
    ...baseModelColumns,
    vendorId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    fieldName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fieldLabel: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fieldType: {
      type: DataTypes.ENUM('text', 'number', 'date', 'select', 'bool', 'document'),
      allowNull: false,
    },
    fieldValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    enumValues: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    defaultValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_vendor_custom_fields',
    timestamps: true,
  },
)

export default AssetVendorCustomField
