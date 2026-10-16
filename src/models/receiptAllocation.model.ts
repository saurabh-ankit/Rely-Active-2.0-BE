import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Invoice } from './invoice.model.js'
import type { Receipt } from './receipt.model.js'

/**
 * How much of a receipt went to each invoice. A payment on an invoice that carries older
 * balances is applied to those first (oldest first): the receipt then has one row for its own
 * invoice (the whole payment) and one per carried invoice it reached (the part passed on to it).
 */
export interface ReceiptAllocationAttributes extends BaseAttributes {
  receiptId: string
  invoiceId: string
  amount: number
}

export type ReceiptAllocationCreationAttributes = Optional<
  ReceiptAllocationAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ReceiptAllocation
  extends BaseModel<ReceiptAllocationAttributes, ReceiptAllocationCreationAttributes>
  implements ReceiptAllocationAttributes
{
  declare receiptId: string
  declare invoiceId: string
  declare amount: number

  declare receipt?: Receipt
  declare invoice?: Invoice
}

ReceiptAllocation.init(
  {
    ...baseModelColumns,
    receiptId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> receipts.id' },
    invoiceId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> invoices.id' },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get(this: ReceiptAllocation) {
        return Number(this.getDataValue('amount') ?? 0)
      },
    },
  },
  {
    sequelize,
    tableName: 'receipt_allocations',
    timestamps: true,
  },
)

export default ReceiptAllocation
