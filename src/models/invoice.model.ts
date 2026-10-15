import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BillingMode, InvoiceStatus, PaymentMethod } from '../enums/billing.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { PropertyUnit } from './propertyUnit.model.js'
import type { Resident } from './resident.model.js'
import type { ServicesInvoice } from './servicesInvoice.model.js'
import type { MiscellaneousBilling } from './miscellaneousBilling.model.js'
import type { Receipt } from './receipt.model.js'
import type { InvoiceDocument } from './invoiceDocument.model.js'
import type { CarriedForwardInvoice } from './carriedForwardInvoice.model.js'

export interface InvoiceBillTo {
  residentId: string | null
  name: string
  phone: string | null
  email: string | null
  unitNumber: string
}

export interface InvoiceAttributes extends BaseAttributes {
  invoiceNumber: string
  unitId: string
  propertyId: string
  billToResidentId?: string | null
  /** Bill-to snapshot at billing time. */
  billToName?: string | null
  billToPhone?: string | null
  billToEmail?: string | null
  billToUnitNumber?: string | null
  startDate: string
  endDate: string
  subtotal: number
  tax: number
  discount: number
  discountPercentage?: number | null
  discountAmount?: number | null
  discountReason?: string | null
  /** GST on (subtotal − discount), split equally into CGST and SGST. Null rates: no GST. */
  gstNumber?: string | null
  gstRate?: number | null
  cgstRate?: number | null
  sgstRate?: number | null
  taxableAmount?: number | null
  cgstAmount?: number | null
  sgstAmount?: number | null
  /** Balances of older invoices carried into this one (no discount or GST on them). */
  carriedForwardAmount: number
  total: number
  discountedAmount: number
  currency: string
  status: InvoiceStatus
  billingMode: BillingMode
  dueDate?: string | null
  paidAmount: number
  /** Still owed on this invoice; 0 once paid or carried into a newer invoice. */
  remainingBalance: number
  /** Its balance moved into a newer invoice (even if later paid through that invoice). */
  isCarriedForward?: boolean
  paymentMethod?: PaymentMethod | null
  paymentReference?: string | null
  notes?: string | null
  isDeleted?: boolean
}

export type InvoiceCreationAttributes = Optional<
  InvoiceAttributes,
  | 'id'
  | 'billToResidentId'
  | 'billToName'
  | 'billToPhone'
  | 'billToEmail'
  | 'billToUnitNumber'
  | 'discountReason'
  | 'gstNumber'
  | 'gstRate'
  | 'cgstRate'
  | 'sgstRate'
  | 'taxableAmount'
  | 'cgstAmount'
  | 'sgstAmount'
  | 'carriedForwardAmount'
  | 'remainingBalance'
  | 'isCarriedForward'
  | 'tax'
  | 'discount'
  | 'discountPercentage'
  | 'discountAmount'
  | 'currency'
  | 'status'
  | 'dueDate'
  | 'paidAmount'
  | 'paymentMethod'
  | 'paymentReference'
  | 'notes'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Invoice extends BaseModel<InvoiceAttributes, InvoiceCreationAttributes> implements InvoiceAttributes {
  declare invoiceNumber: string
  declare unitId: string
  declare propertyId: string
  declare billToResidentId: string | null
  declare billToName: string | null
  declare billToPhone: string | null
  declare billToEmail: string | null
  declare billToUnitNumber: string | null
  declare startDate: string
  declare endDate: string
  declare subtotal: number
  declare tax: number
  declare discount: number
  declare discountPercentage: number | null
  declare discountAmount: number | null
  declare discountReason: string | null
  declare gstNumber: string | null
  declare gstRate: number | null
  declare cgstRate: number | null
  declare sgstRate: number | null
  declare taxableAmount: number | null
  declare cgstAmount: number | null
  declare sgstAmount: number | null
  declare carriedForwardAmount: number
  declare total: number
  declare discountedAmount: number
  declare currency: string
  declare status: InvoiceStatus
  declare billingMode: BillingMode
  declare dueDate: string | null
  declare paidAmount: number
  declare remainingBalance: number
  declare isCarriedForward: boolean
  declare paymentMethod: PaymentMethod | null
  declare paymentReference: string | null
  declare notes: string | null
  declare isDeleted: boolean

  declare unit?: PropertyUnit
  declare billToResident?: Resident
  declare services?: ServicesInvoice[]
  declare miscellaneousItems?: MiscellaneousBilling[]
  declare receipts?: Receipt[]
  declare documents?: InvoiceDocument[]
  declare carriedForwardTo?: CarriedForwardInvoice | null
}

const money = (field: string, allowNull = false, precision: [number, number] = [12, 2]) => ({
  type: DataTypes.DECIMAL(...precision),
  allowNull,
  ...(allowNull ? {} : { defaultValue: 0 }),
  get(this: Invoice) {
    const val = this.getDataValue(field as keyof InvoiceAttributes)
    return val === null || val === undefined ? (allowNull ? null : 0) : Number(val)
  },
})

Invoice.init(
  {
    ...baseModelColumns,
    invoiceNumber: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    unitId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> property_units.id' },
    propertyId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> properties.id' },
    billToResidentId: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> residents.id (primary payer)' },
    billToName: { type: DataTypes.STRING(255), allowNull: true },
    billToPhone: { type: DataTypes.STRING(30), allowNull: true },
    billToEmail: { type: DataTypes.STRING(255), allowNull: true },
    billToUnitNumber: { type: DataTypes.STRING(50), allowNull: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    subtotal: money('subtotal'),
    tax: money('tax'),
    discount: money('discount'),
    discountPercentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    discountAmount: money('discountAmount', true),
    discountReason: { type: DataTypes.STRING(500), allowNull: true },
    gstNumber: { type: DataTypes.STRING(30), allowNull: true },
    gstRate: money('gstRate', true, [5, 2]),
    cgstRate: money('cgstRate', true, [5, 2]),
    sgstRate: money('sgstRate', true, [5, 2]),
    taxableAmount: money('taxableAmount', true),
    cgstAmount: money('cgstAmount', true),
    sgstAmount: money('sgstAmount', true),
    carriedForwardAmount: money('carriedForwardAmount'),
    total: money('total'),
    discountedAmount: money('discountedAmount'),
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
    status: {
      type: DataTypes.ENUM(...Object.values(InvoiceStatus)),
      allowNull: false,
      defaultValue: InvoiceStatus.PENDING,
    },
    billingMode: { type: DataTypes.ENUM(...Object.values(BillingMode)), allowNull: false },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    paidAmount: money('paidAmount'),
    remainingBalance: money('remainingBalance'),
    isCarriedForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    paymentMethod: { type: DataTypes.ENUM(...Object.values(PaymentMethod)), allowNull: true },
    paymentReference: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'invoices',
    timestamps: true,
  },
)

export default Invoice
