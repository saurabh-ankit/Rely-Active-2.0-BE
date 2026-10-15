import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Invoice } from './invoice.model.js'

/** An unpaid invoice whose balance was rolled into a newer invoice. */
export interface CarriedForwardInvoiceAttributes extends BaseAttributes {
  targetInvoiceId: string
  sourceInvoiceId: string
  unitId: string
  propertyId: string
  carriedAmount: number
  originalTotal?: number | null
  originalPaid?: number | null
  /** Source invoice status before it was carried forward (restored if the target is deleted). */
  sourceStatus?: string | null
}

export type CarriedForwardInvoiceCreationAttributes = Optional<
  CarriedForwardInvoiceAttributes,
  'id' | 'originalTotal' | 'originalPaid' | 'sourceStatus' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class CarriedForwardInvoice
  extends BaseModel<CarriedForwardInvoiceAttributes, CarriedForwardInvoiceCreationAttributes>
  implements CarriedForwardInvoiceAttributes
{
  declare targetInvoiceId: string
  declare sourceInvoiceId: string
  declare unitId: string
  declare propertyId: string
  declare carriedAmount: number
  declare originalTotal: number | null
  declare originalPaid: number | null
  declare sourceStatus: string | null

  declare targetInvoice?: Invoice
  declare sourceInvoice?: Invoice
}

const money = (field: keyof CarriedForwardInvoiceAttributes, allowNull: boolean) => ({
  type: DataTypes.DECIMAL(12, 2),
  allowNull,
  get(this: CarriedForwardInvoice) {
    const val = this.getDataValue(field)
    return val === null || val === undefined ? (allowNull ? null : 0) : Number(val)
  },
})

CarriedForwardInvoice.init(
  {
    ...baseModelColumns,
    targetInvoiceId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> invoices.id (new invoice)' },
    sourceInvoiceId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> invoices.id (carried invoice)' },
    unitId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> property_units.id' },
    propertyId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> properties.id' },
    carriedAmount: money('carriedAmount', false),
    originalTotal: money('originalTotal', true),
    originalPaid: money('originalPaid', true),
    sourceStatus: { type: DataTypes.STRING(30), allowNull: true },
  },
  {
    sequelize,
    tableName: 'carried_forward_invoices',
    timestamps: true,
  },
)

export default CarriedForwardInvoice
