import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel } from './base.model.js'

export interface CarriedForwardInvoiceAttributes extends BaseAttributes {
  originalInvoiceId: string
  newInvoiceId?: string | null
  residentId: string
  carriedAmount: number
}

export type CarriedForwardInvoiceCreationAttributes = Optional<CarriedForwardInvoiceAttributes, 'id' | 'newInvoiceId'>

export class CarriedForwardInvoice
  extends BaseModel<CarriedForwardInvoiceAttributes, CarriedForwardInvoiceCreationAttributes>
  implements CarriedForwardInvoiceAttributes
{
  declare originalInvoiceId: string
  declare newInvoiceId: string | null
  declare residentId: string
  declare carriedAmount: number
}

CarriedForwardInvoice.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    originalInvoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    newInvoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    carriedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'carried_forward_invoices',
    timestamps: true,
  },
)
