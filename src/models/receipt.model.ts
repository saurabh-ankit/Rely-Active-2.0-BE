import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { InvoiceStatus, PaymentMethod } from '../enums/billing.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Invoice } from './invoice.model.js'
import type { User } from './user.model.js'

/** One payment received against an invoice. */
export interface ReceiptAttributes extends BaseAttributes {
  receiptNumber: string
  invoiceId: string
  unitId: string
  paidAmount: number
  paymentMethod: PaymentMethod
  paymentReference?: string | null
  notes?: string | null
  /** Staff member the money was handed to. */
  handedOverTo?: string | null
  /** Invoice total, amount paid on it before this payment, and balance and status right after it. */
  invoiceTotal?: number | null
  paidBefore?: number | null
  invoiceRemainingBalance?: number | null
  invoiceStatus?: InvoiceStatus | null
  imageUrl?: string | null
  isDeleted?: boolean
}

export type ReceiptCreationAttributes = Optional<
  ReceiptAttributes,
  | 'id'
  | 'paymentReference'
  | 'notes'
  | 'handedOverTo'
  | 'invoiceTotal'
  | 'paidBefore'
  | 'invoiceRemainingBalance'
  | 'invoiceStatus'
  | 'imageUrl'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Receipt extends BaseModel<ReceiptAttributes, ReceiptCreationAttributes> implements ReceiptAttributes {
  declare receiptNumber: string
  declare invoiceId: string
  declare unitId: string
  declare paidAmount: number
  declare paymentMethod: PaymentMethod
  declare paymentReference: string | null
  declare notes: string | null
  declare handedOverTo: string | null
  declare invoiceTotal: number | null
  declare paidBefore: number | null
  declare invoiceRemainingBalance: number | null
  declare invoiceStatus: InvoiceStatus | null
  declare imageUrl: string | null
  declare isDeleted: boolean

  declare invoice?: Invoice
  declare handedOverToUser?: User
}

const optionalMoney = (field: 'invoiceTotal' | 'paidBefore' | 'invoiceRemainingBalance') => ({
  type: DataTypes.DECIMAL(12, 2),
  allowNull: true,
  get(this: Receipt) {
    const val = this.getDataValue(field)
    return val === null || val === undefined ? null : Number(val)
  },
})

Receipt.init(
  {
    ...baseModelColumns,
    receiptNumber: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    invoiceId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> invoices.id' },
    unitId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> property_units.id' },
    paidAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get(this: Receipt) {
        return Number(this.getDataValue('paidAmount') ?? 0)
      },
    },
    paymentMethod: { type: DataTypes.ENUM(...Object.values(PaymentMethod)), allowNull: false },
    paymentReference: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    handedOverTo: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> users.id' },
    invoiceTotal: optionalMoney('invoiceTotal'),
    paidBefore: optionalMoney('paidBefore'),
    invoiceRemainingBalance: optionalMoney('invoiceRemainingBalance'),
    invoiceStatus: { type: DataTypes.ENUM(...Object.values(InvoiceStatus)), allowNull: true },
    imageUrl: { type: DataTypes.STRING(1024), allowNull: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'receipts',
    timestamps: true,
  },
)

export default Receipt
