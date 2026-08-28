import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'bool' | 'document'

export interface CompanyCustomFieldAttributes extends BaseAttributes {
  companyId: string
  fieldName: string
  fieldLabel: string
  fieldType: CustomFieldType
  fieldValue?: string | null
  enumValues?: string[] | null
  displayOrder?: number
  defaultValue?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type CompanyCustomFieldCreationAttributes = Optional<
  CompanyCustomFieldAttributes,
  | 'id'
  | 'fieldValue'
  | 'enumValues'
  | 'displayOrder'
  | 'defaultValue'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class CompanyCustomField
  extends BaseModel<CompanyCustomFieldAttributes, CompanyCustomFieldCreationAttributes>
  implements CompanyCustomFieldAttributes
{
  declare companyId: string
  declare fieldName: string
  declare fieldLabel: string
  declare fieldType: CustomFieldType
  declare fieldValue: string | null
  declare enumValues: string[] | null
  declare displayOrder: number
  declare defaultValue: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

CompanyCustomField.init(
  {
    ...baseModelColumns,
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id',
      },
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
      defaultValue: 0,
      allowNull: false,
    },
    defaultValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'company_custom_fields',
    timestamps: true,
  },
)
