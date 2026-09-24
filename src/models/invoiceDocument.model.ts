import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel } from './base.model.js'

export interface InvoiceDocumentAttributes extends BaseAttributes {
  invoiceId: string
  documentType: string
  fileUrl: string
}

export type InvoiceDocumentCreationAttributes = Optional<InvoiceDocumentAttributes, 'id'>

export class InvoiceDocument
  extends BaseModel<InvoiceDocumentAttributes, InvoiceDocumentCreationAttributes>
  implements InvoiceDocumentAttributes
{
  declare invoiceId: string
  declare documentType: string
  declare fileUrl: string
}

InvoiceDocument.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    documentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'invoice_documents',
    timestamps: true,
  },
)
