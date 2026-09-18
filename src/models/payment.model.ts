import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { PaymentMethod, PaymentStatus } from '../enums/billing.enum.js'

import type { BillingAccount } from './billingAccount.model.js'
import type { PaymentAllocation } from './paymentAllocation.model.js'

export interface PaymentAttributes extends BaseAttributes {
  paymentNumber: string
  billingAccountId: string
  unitId: string
  propertyId: string
  companyId: string
  paymentDate: Date | string
  amount: number
  currency: string
  paymentMethod: PaymentMethod
  transactionReference?: string | null
  bankName?: string | null
  chequeNumber?: string | null
  status: PaymentStatus
  confirmedAt?: Date | null
  receivedBy?: string | null
  notes?: string | null
}

export type PaymentCreationAttributes = Optional<
  PaymentAttributes,
  | 'id'
  | 'currency'
  | 'transactionReference'
  | 'bankName'
  | 'chequeNumber'
  | 'status'
  | 'confirmedAt'
  | 'receivedBy'
  | 'notes'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Payment extends BaseModel<PaymentAttributes, PaymentCreationAttributes> implements PaymentAttributes {
  declare paymentNumber: string
  declare billingAccountId: string
  declare unitId: string
  declare propertyId: string
  declare companyId: string
  declare paymentDate: Date | string
  declare amount: number
  declare currency: string
  declare paymentMethod: PaymentMethod
  declare transactionReference: string | null
  declare bankName: string | null
  declare chequeNumber: string | null
  declare status: PaymentStatus
  declare confirmedAt: Date | null
  declare receivedBy: string | null
  declare notes: string | null

  // Associations
  declare billingAccount?: BillingAccount
  declare allocations?: PaymentAllocation[]
}

Payment.init(
  {
    ...baseModelColumns,
    paymentNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    billingAccountId: { type: DataTypes.UUID, allowNull: false },
    unitId: { type: DataTypes.UUID, allowNull: false },
    propertyId: { type: DataTypes.UUID, allowNull: false },
    companyId: { type: DataTypes.UUID, allowNull: false },
    paymentDate: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
    paymentMethod: {
      type: DataTypes.ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'NEFT', 'RTGS', 'CARD', 'OTHER'),
      allowNull: false,
    },
    transactionReference: { type: DataTypes.STRING(255), allowNull: true },
    bankName: { type: DataTypes.STRING(255), allowNull: true },
    chequeNumber: { type: DataTypes.STRING(100), allowNull: true },
    status: {
      type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'REVERSED'),
      allowNull: false,
      defaultValue: PaymentStatus.CONFIRMED,
    },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    receivedBy: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'billing_payments',
    timestamps: true,
  },
)

export default Payment
