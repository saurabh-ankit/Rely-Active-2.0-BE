import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { InvoiceLineType } from '../enums/billing.enum.js'

import type { Invoice } from './invoice.model.js'
import type { Resident } from './resident.model.js'
import type { BillingProduct } from './billingProduct.model.js'

// InvoiceLine is immutable — no BaseModel, no updatedAt
export interface InvoiceLineAttributes {
  id: string
  invoiceId: string
  subscriptionId?: string | null
  billingEventId?: string | null
  productId?: string | null
  lineType: InvoiceLineType
  chargeType: string
  description: string
  serviceDate?: Date | string | null
  consumedByResidentId?: string | null
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  sortOrder: number
  createdAt?: Date
}

export type InvoiceLineCreationAttributes = Optional<
  InvoiceLineAttributes,
  | 'id'
  | 'subscriptionId'
  | 'billingEventId'
  | 'productId'
  | 'serviceDate'
  | 'consumedByResidentId'
  | 'quantity'
  | 'unitPrice'
  | 'subtotal'
  | 'discountAmount'
  | 'taxableAmount'
  | 'taxRate'
  | 'taxAmount'
  | 'totalAmount'
  | 'sortOrder'
  | 'createdAt'
>

export class InvoiceLine
  extends Model<InvoiceLineAttributes, InvoiceLineCreationAttributes>
  implements InvoiceLineAttributes
{
  declare id: string
  declare invoiceId: string
  declare subscriptionId: string | null
  declare billingEventId: string | null
  declare productId: string | null
  declare lineType: InvoiceLineType
  declare chargeType: string
  declare description: string
  declare serviceDate: Date | string | null
  declare consumedByResidentId: string | null
  declare quantity: number
  declare unitPrice: number
  declare subtotal: number
  declare discountAmount: number
  declare taxableAmount: number
  declare taxRate: number
  declare taxAmount: number
  declare totalAmount: number
  declare sortOrder: number
  declare readonly createdAt: Date

  // Associations
  declare invoice?: Invoice
  declare consumedByResident?: Resident
  declare product?: BillingProduct
}

InvoiceLine.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    invoiceId: { type: DataTypes.UUID, allowNull: false },
    subscriptionId: { type: DataTypes.UUID, allowNull: true },
    billingEventId: { type: DataTypes.UUID, allowNull: true },
    productId: { type: DataTypes.UUID, allowNull: true },
    lineType: {
      type: DataTypes.ENUM('SUBSCRIPTION', 'USAGE', 'DISCOUNT', 'TAX', 'ADJUSTMENT'),
      allowNull: false,
    },
    chargeType: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    serviceDate: { type: DataTypes.DATEONLY, allowNull: true },
    consumedByResidentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'WHO used this service (consumer, not payer)',
    },
    quantity: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1.0 },
    unitPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    discountAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    taxableAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    taxRate: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 0.0 },
    taxAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    totalAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'billing_invoice_lines',
    timestamps: false, // Immutable — no updatedAt
  },
)

export default InvoiceLine
