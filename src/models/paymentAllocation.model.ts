import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

import type { Payment } from './payment.model.js'
import type { Invoice } from './invoice.model.js'

// PaymentAllocation is immutable — no updatedAt
export interface PaymentAllocationAttributes {
  id: string
  paymentId: string
  invoiceId: string
  billingAccountId: string
  allocatedAmount: number
  allocationDate: Date | string
  createdAt?: Date
}

export type PaymentAllocationCreationAttributes = Optional<PaymentAllocationAttributes, 'id' | 'createdAt'>

export class PaymentAllocation
  extends Model<PaymentAllocationAttributes, PaymentAllocationCreationAttributes>
  implements PaymentAllocationAttributes
{
  declare id: string
  declare paymentId: string
  declare invoiceId: string
  declare billingAccountId: string
  declare allocatedAmount: number
  declare allocationDate: Date | string
  declare readonly createdAt: Date

  // Associations
  declare payment?: Payment
  declare invoice?: Invoice
}

PaymentAllocation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    paymentId: { type: DataTypes.UUID, allowNull: false },
    invoiceId: { type: DataTypes.UUID, allowNull: false },
    billingAccountId: { type: DataTypes.UUID, allowNull: false },
    allocatedAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    allocationDate: { type: DataTypes.DATEONLY, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'billing_payment_allocations',
    timestamps: false, // Immutable — no updatedAt
  },
)

export default PaymentAllocation
