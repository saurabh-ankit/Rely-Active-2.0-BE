import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { InvoiceDocumentType } from '../enums/billing.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Invoice } from './invoice.model.js'

/** Generated invoice / receipt PDF stored in S3. */
export interface InvoiceDocumentAttributes extends BaseAttributes {
  invoiceId: string
  receiptId?: string | null
  documentType: InvoiceDocumentType
  s3Url: string
  s3Key: string
  isDeleted?: boolean
}

export type InvoiceDocumentCreationAttributes = Optional<
  InvoiceDocumentAttributes,
  'id' | 'receiptId' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class InvoiceDocument
  extends BaseModel<InvoiceDocumentAttributes, InvoiceDocumentCreationAttributes>
  implements InvoiceDocumentAttributes
{
  declare invoiceId: string
  declare receiptId: string | null
  declare documentType: InvoiceDocumentType
  declare s3Url: string
  declare s3Key: string
  declare isDeleted: boolean

  declare invoice?: Invoice
}

InvoiceDocument.init(
  {
    ...baseModelColumns,
    invoiceId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> invoices.id' },
    receiptId: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> receipts.id' },
    documentType: { type: DataTypes.ENUM(...Object.values(InvoiceDocumentType)), allowNull: false },
    s3Url: { type: DataTypes.STRING(1024), allowNull: false },
    s3Key: { type: DataTypes.STRING(512), allowNull: false },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'invoice_documents',
    timestamps: true,
  },
)

export default InvoiceDocument
