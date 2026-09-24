import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel } from './base.model.js'
import type { Invoice } from './invoice.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'

export interface MiscellaneousBillingAttributes extends BaseAttributes {
  invoiceId: string
  unitId?: string | null
  name: string
  description?: string | null
  quantity: number
  price: number
  total: number
}

export type MiscellaneousBillingCreationAttributes = Optional<
  MiscellaneousBillingAttributes,
  'id' | 'unitId' | 'description' | 'quantity'
>

export class MiscellaneousBilling
  extends BaseModel<MiscellaneousBillingAttributes, MiscellaneousBillingCreationAttributes>
  implements MiscellaneousBillingAttributes
{
  declare invoiceId: string
  declare unitId: string | null
  declare name: string
  declare description: string | null
  declare quantity: number
  declare price: number
  declare total: number

  declare invoice?: Invoice
  declare unit?: PropertyUnit
}

MiscellaneousBilling.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 1,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'miscellaneous_billing',
    timestamps: true,
  },
)
