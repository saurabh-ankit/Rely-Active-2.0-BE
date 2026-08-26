import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'bool' | 'document'

export interface CompanyCustomFieldAttributes {
  id: string
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
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
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
  extends Model<CompanyCustomFieldAttributes, CompanyCustomFieldCreationAttributes>
  implements CompanyCustomFieldAttributes
{
  declare id: string
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
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

CompanyCustomField.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
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
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'company_custom_fields',
    timestamps: true,
  },
)
