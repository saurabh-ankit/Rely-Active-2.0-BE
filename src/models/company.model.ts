import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface CompanyAttributes {
  id: string
  company_name: string
  company_gst_number?: string | null
  email_id: string
  contact_number: string
  alternate_contact_number?: string | null
  company_head_office_address: string
  document_name?: string | null
  document_description?: string | null
  document_path?: string | null
  bank_name?: string | null
  branch_name?: string | null
  account_no?: string | null
  ifsc_code?: string | null
  accountant_name?: string | null
  accountant_signature?: string | null
  isActive?: boolean
  isDeleted?: boolean
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type CompanyCreationAttributes = Optional<
  CompanyAttributes,
  | 'id'
  | 'company_gst_number'
  | 'alternate_contact_number'
  | 'document_name'
  | 'document_description'
  | 'document_path'
  | 'bank_name'
  | 'branch_name'
  | 'account_no'
  | 'ifsc_code'
  | 'accountant_name'
  | 'accountant_signature'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Company extends Model<CompanyAttributes, CompanyCreationAttributes> implements CompanyAttributes {
  declare id: string
  declare company_name: string
  declare company_gst_number: string | null
  declare email_id: string
  declare contact_number: string
  declare alternate_contact_number: string | null
  declare company_head_office_address: string
  declare document_name: string | null
  declare document_description: string | null
  declare document_path: string | null
  declare bank_name: string | null
  declare branch_name: string | null
  declare account_no: string | null
  declare ifsc_code: string | null
  declare accountant_name: string | null
  declare accountant_signature: string | null
  declare isActive: boolean
  declare isDeleted: boolean
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

Company.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Name of the company',
    },
    company_gst_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'GST number of the company',
    },
    email_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Email ID of the company',
    },
    contact_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Primary contact number of the company',
    },
    alternate_contact_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Alternate contact number of the company',
    },
    company_head_office_address: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Head office address of the company',
    },
    document_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Name of the uploaded document',
    },
    document_description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Description of the uploaded document',
    },
    document_path: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'S3 or local file path for the uploaded document',
    },
    bank_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Bank name of the company',
    },
    branch_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Branch name of the bank',
    },
    account_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Bank account number of the company',
    },
    ifsc_code: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'IFSC code of the bank',
    },
    accountant_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Name of the accountant',
    },
    accountant_signature: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'File path for the accountant signature',
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
    tableName: 'company',
    timestamps: true,
  },
)
