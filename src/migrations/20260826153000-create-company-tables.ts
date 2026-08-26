import { DataTypes } from 'sequelize'
import type { QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.createTable('company', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
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
      comment: 'File path for the uploaded document',
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
      allowNull: false,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.createTable('company_custom_fields', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
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
      allowNull: false,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.dropTable('company_custom_fields')
  await queryInterface.dropTable('company')
}
