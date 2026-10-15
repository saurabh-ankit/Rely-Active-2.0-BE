import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Invoice } from './invoice.model.js'

/** Ad-hoc line added on the invoice screen at billing time. */
export interface MiscellaneousBillingAttributes extends BaseAttributes {
  invoiceId: string
  name: string
  description?: string | null
  quantity: number
  price: number
  total: number
  isDeleted?: boolean
}

export type MiscellaneousBillingCreationAttributes = Optional<
  MiscellaneousBillingAttributes,
  'id' | 'description' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class MiscellaneousBilling
  extends BaseModel<MiscellaneousBillingAttributes, MiscellaneousBillingCreationAttributes>
  implements MiscellaneousBillingAttributes
{
  declare invoiceId: string
  declare name: string
  declare description: string | null
  declare quantity: number
  declare price: number
  declare total: number
  declare isDeleted: boolean

  declare invoice?: Invoice
}

const num = (field: keyof MiscellaneousBillingAttributes, type: DataTypes.DataType) => ({
  type,
  allowNull: false,
  defaultValue: 0,
  get(this: MiscellaneousBilling) {
    return Number(this.getDataValue(field) ?? 0)
  },
})

MiscellaneousBilling.init(
  {
    ...baseModelColumns,
    invoiceId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> invoices.id' },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    quantity: num('quantity', DataTypes.DECIMAL(12, 3)),
    price: num('price', DataTypes.DECIMAL(12, 2)),
    total: num('total', DataTypes.DECIMAL(12, 2)),
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'miscellaneous_billing',
    timestamps: true,
  },
)

export default MiscellaneousBilling
