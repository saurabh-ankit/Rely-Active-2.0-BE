import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel } from './base.model.js'
import type { Invoice } from './invoice.model.js'

export enum ServiceType {
  FOOD_PACKAGE = 'food_package',
  FOOD_ORDERS = 'food_orders',
  MONTHLY_RENTS = 'monthly_rents',
}

export interface ServicesInvoiceAttributes extends BaseAttributes {
  invoiceId: string
  serviceType: ServiceType | string
  name: string
  description?: string | null
  quantity: number
  price: number
  total: number
}

export type ServicesInvoiceCreationAttributes = Optional<ServicesInvoiceAttributes, 'id' | 'description' | 'quantity'>

export class ServicesInvoice
  extends BaseModel<ServicesInvoiceAttributes, ServicesInvoiceCreationAttributes>
  implements ServicesInvoiceAttributes
{
  declare invoiceId: string
  declare serviceType: ServiceType | string
  declare name: string
  declare description: string | null
  declare quantity: number
  declare price: number
  declare total: number

  declare invoice?: Invoice
}

ServicesInvoice.init(
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
    serviceType: {
      type: DataTypes.ENUM('food_package', 'food_orders', 'monthly_rents'),
      allowNull: false,
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
    tableName: 'services_invoice',
    timestamps: true,
  },
)
