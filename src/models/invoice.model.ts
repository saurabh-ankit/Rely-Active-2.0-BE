import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { InvoiceStatus, InvoiceType } from '../enums/billing.enum.js'

import type { BillingAccount } from './billingAccount.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'
import type { Resident } from './resident.model.js'
import type { InvoiceLine } from './invoiceLine.model.js'
import type { PaymentAllocation } from './paymentAllocation.model.js'

export interface InvoiceAttributes {
  id: string
  invoiceNumber: string
  billingAccountId: string
  unitId: string
  residentId?: string | null
  propertyId: string
  companyId: string
  invoiceType: InvoiceType
  referenceInvoiceId?: string | null

  // Bill-To Snapshot
  billToName: string
  billToEmail?: string | null
  billToPhone?: string | null
  billToAddress?: string | null
  billToGstin?: string | null

  periodStart: Date | string
  periodEnd: Date | string
  issueDate: Date | string
  dueDate: Date | string

  subtotal: number
  discountTotal: number
  discountNote?: string | null
  taxableAmount: number
  taxTotal: number
  roundingAdjustment: number
  grandTotal: number
  amountPaid: number
  amountDue: number

  status: InvoiceStatus
  finalizedAt?: Date | null
  paidAt?: Date | null

  currency: string
  pdfUrl?: string | null
  isDeleted?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type InvoiceCreationAttributes = Optional<
  InvoiceAttributes,
  | 'id'
  | 'residentId'
  | 'invoiceType'
  | 'referenceInvoiceId'
  | 'billToEmail'
  | 'billToPhone'
  | 'billToAddress'
  | 'billToGstin'
  | 'subtotal'
  | 'discountTotal'
  | 'discountNote'
  | 'taxableAmount'
  | 'taxTotal'
  | 'roundingAdjustment'
  | 'grandTotal'
  | 'amountPaid'
  | 'amountDue'
  | 'status'
  | 'finalizedAt'
  | 'paidAt'
  | 'currency'
  | 'pdfUrl'
  | 'isDeleted'
  | 'createdAt'
  | 'updatedAt'
>

export class Invoice
  extends Model<InvoiceAttributes, InvoiceCreationAttributes>
  implements InvoiceAttributes
{
  declare id: string
  declare invoiceNumber: string
  declare billingAccountId: string
  declare unitId: string
  declare residentId: string | null
  declare propertyId: string
  declare companyId: string
  declare invoiceType: InvoiceType
  declare referenceInvoiceId: string | null
  declare billToName: string
  declare billToEmail: string | null
  declare billToPhone: string | null
  declare billToAddress: string | null
  declare billToGstin: string | null
  declare periodStart: Date | string
  declare periodEnd: Date | string
  declare issueDate: Date | string
  declare dueDate: Date | string
  declare subtotal: number
  declare discountTotal: number
  declare discountNote: string | null
  declare taxableAmount: number
  declare taxTotal: number
  declare roundingAdjustment: number
  declare grandTotal: number
  declare amountPaid: number
  declare amountDue: number
  declare status: InvoiceStatus
  declare finalizedAt: Date | null
  declare paidAt: Date | null
  declare currency: string
  declare pdfUrl: string | null
  declare isDeleted: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations
  declare billingAccount?: BillingAccount
  declare unit?: PropertyUnit
  declare resident?: Resident
  declare lines?: InvoiceLine[]
  declare paymentAllocations?: PaymentAllocation[]
}

Invoice.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    invoiceNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    billingAccountId: { type: DataTypes.UUID, allowNull: false },
    unitId: { type: DataTypes.UUID, allowNull: false },
    residentId: { type: DataTypes.UUID, allowNull: true },
    propertyId: { type: DataTypes.UUID, allowNull: false },
    companyId: { type: DataTypes.UUID, allowNull: false },
    invoiceType: {
      type: DataTypes.ENUM('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'),
      allowNull: false,
      defaultValue: InvoiceType.INVOICE,
    },
    referenceInvoiceId: { type: DataTypes.UUID, allowNull: true },
    billToName: { type: DataTypes.STRING(255), allowNull: false },
    billToEmail: { type: DataTypes.STRING(150), allowNull: true },
    billToPhone: { type: DataTypes.STRING(30), allowNull: true },
    billToAddress: { type: DataTypes.TEXT, allowNull: true },
    billToGstin: { type: DataTypes.STRING(50), allowNull: true },
    periodStart: { type: DataTypes.DATEONLY, allowNull: false },
    periodEnd: { type: DataTypes.DATEONLY, allowNull: false },
    issueDate: { type: DataTypes.DATEONLY, allowNull: false },
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    discountTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    discountNote: { type: DataTypes.STRING(500), allowNull: true },
    taxableAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    taxTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    roundingAdjustment: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0.0 },
    grandTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    amountPaid: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    amountDue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    status: {
      type: DataTypes.ENUM('DRAFT', 'PREVIEW', 'FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'OVERDUE'),
      allowNull: false,
      defaultValue: InvoiceStatus.DRAFT,
    },
    finalizedAt: { type: DataTypes.DATE, allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
    pdfUrl: { type: DataTypes.TEXT, allowNull: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'billing_invoices',
    timestamps: true,
  },
)

export default Invoice
