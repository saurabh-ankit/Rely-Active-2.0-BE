import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel } from './base.model.js'
import type { ServicesInvoice } from './servicesInvoice.model.js'
import type { MiscellaneousBilling } from './miscellaneousBilling.model.js'
import type { Receipt } from './receipt.model.js'
import type { Resident } from './resident.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE',
  OBSOLETE = 'OBSOLETE',
  CARRY_FORWARDED = 'CARRY_FORWARDED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  CHEQUE = 'CHEQUE',
  CARD = 'CARD',
  NET_BANKING = 'NET_BANKING',
  OTHER = 'OTHER',
}

export interface InvoiceAttributes extends BaseAttributes {
  invoiceNumber: string
  residentId?: string | null
  unitId?: string | null
  loc_id: string
  startDate: Date | string
  endDate: Date | string
  subtotal: number
  tax: number
  discount: number
  discountPercentage?: number | null
  discountAmount?: number | null
  total: number
  discountedAmount: number
  currency: string
  status: InvoiceStatus | string
  billingMode: 'MONTHLY'
  dueDate?: Date | string | null
  paidAmount: number
  paymentMethod?: PaymentMethod | string | null
  paymentReference?: string | null
  notes?: string | null
  invoiceData?: Record<string, unknown> | null
  isFinalBill: boolean
  depositDeduction: number
  advanceDeduction: number
  refundAmount: number
  netRefundDue: number
  refundNote?: string | null
  banking_on: 'location' | 'company'
}

export type InvoiceCreationAttributes = Optional<
  InvoiceAttributes,
  | 'id'
  | 'residentId'
  | 'unitId'
  | 'subtotal'
  | 'tax'
  | 'discount'
  | 'discountPercentage'
  | 'discountAmount'
  | 'total'
  | 'discountedAmount'
  | 'currency'
  | 'status'
  | 'billingMode'
  | 'dueDate'
  | 'paidAmount'
  | 'paymentMethod'
  | 'paymentReference'
  | 'notes'
  | 'invoiceData'
  | 'isFinalBill'
  | 'depositDeduction'
  | 'advanceDeduction'
  | 'refundAmount'
  | 'netRefundDue'
  | 'refundNote'
  | 'banking_on'
>

export class Invoice extends BaseModel<InvoiceAttributes, InvoiceCreationAttributes> implements InvoiceAttributes {
  declare invoiceNumber: string
  declare residentId: string | null
  declare unitId: string | null
  declare loc_id: string
  declare startDate: Date
  declare endDate: Date
  declare subtotal: number
  declare tax: number
  declare discount: number
  declare discountPercentage: number | null
  declare discountAmount: number | null
  declare total: number
  declare discountedAmount: number
  declare currency: string
  declare status: InvoiceStatus | string
  declare billingMode: 'MONTHLY'
  declare dueDate: Date | null
  declare paidAmount: number
  declare paymentMethod: PaymentMethod | string | null
  declare paymentReference: string | null
  declare notes: string | null
  declare invoiceData: Record<string, unknown> | null
  declare isFinalBill: boolean
  declare depositDeduction: number
  declare advanceDeduction: number
  declare refundAmount: number
  declare netRefundDue: number
  declare refundNote: string | null
  declare banking_on: 'location' | 'company'

  declare services?: ServicesInvoice[]
  declare miscellaneousItems?: MiscellaneousBilling[]
  declare receipts?: Receipt[]
  declare resident?: Resident
  declare unit?: PropertyUnit
}

Invoice.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    loc_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    tax: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    discount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    discountPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    discountAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    discountedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'INR',
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(
        'DRAFT',
        'PENDING',
        'PAID',
        'PARTIALLY_PAID',
        'CANCELLED',
        'OVERDUE',
        'OBSOLETE',
        'CARRY_FORWARDED',
      ),
      defaultValue: 'DRAFT',
      allowNull: false,
    },
    billingMode: {
      type: DataTypes.ENUM('MONTHLY'),
      defaultValue: 'MONTHLY',
      allowNull: false,
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    paidAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.ENUM('CASH', 'UPI', 'CHEQUE', 'CARD', 'NET_BANKING', 'OTHER'),
      allowNull: true,
    },
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    invoiceData: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    isFinalBill: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    depositDeduction: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    advanceDeduction: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    refundAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    netRefundDue: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },
    refundNote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    banking_on: {
      type: DataTypes.ENUM('location', 'company'),
      defaultValue: 'company',
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'invoices',
    timestamps: true,
  },
)
