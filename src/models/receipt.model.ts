import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel } from './base.model.js'
import { PaymentMethod, type Invoice } from './invoice.model.js'
import type { Resident } from './resident.model.js'

export interface ReceiptAttributes extends BaseAttributes {
  receiptNumber: string
  invoiceId: string
  residentId?: string | null
  unitId?: string | null
  paidAmount: number
  paymentMethod: PaymentMethod | string
  paymentReference?: string | null
  notes?: string | null
  handed_over_to?: string | null
  invoiceRemainingBalance?: number | null
  invoiceStatus?: string | null
  imageUrl?: string | null
}

export type ReceiptCreationAttributes = Optional<
  ReceiptAttributes,
  | 'id'
  | 'residentId'
  | 'unitId'
  | 'paymentReference'
  | 'notes'
  | 'handed_over_to'
  | 'invoiceRemainingBalance'
  | 'invoiceStatus'
  | 'imageUrl'
>

export class Receipt extends BaseModel<ReceiptAttributes, ReceiptCreationAttributes> implements ReceiptAttributes {
  declare receiptNumber: string
  declare invoiceId: string
  declare residentId: string | null
  declare unitId: string | null
  declare paidAmount: number
  declare paymentMethod: PaymentMethod | string
  declare paymentReference: string | null
  declare notes: string | null
  declare handed_over_to: string | null
  declare invoiceRemainingBalance: number | null
  declare invoiceStatus: string | null
  declare imageUrl: string | null

  declare invoice?: Invoice
  declare resident?: Resident
}

Receipt.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    receiptNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    invoiceId: {
      type: DataTypes.UUID,
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
    paidAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.ENUM('CASH', 'UPI', 'CHEQUE', 'CARD', 'NET_BANKING', 'OTHER'),
      allowNull: false,
    },
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    handed_over_to: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    invoiceRemainingBalance: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    invoiceStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'receipts',
    timestamps: true,
  },
)
