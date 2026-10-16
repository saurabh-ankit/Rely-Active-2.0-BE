import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { ServiceType } from '../enums/billing.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Invoice } from './invoice.model.js'
import type { Resident } from './resident.model.js'

/** One billed line on an invoice (snapshot of the source record at billing time). */
export interface ServicesInvoiceAttributes extends BaseAttributes {
  invoiceId: string
  serviceType: ServiceType
  name: string
  description?: string | null
  quantity: number
  price: number
  total: number
  /** Resident who used the service (the invoice is per flat). */
  residentId?: string | null
  /** Family member who used the service, if not the resident. */
  familyMemberId?: string | null
  /** Who used it, as printed on the invoice. */
  consumerType?: 'RESIDENT' | 'FAMILY_MEMBER' | null
  consumerName?: string | null
  /** Id of the source record (order, ticket, subscription…); with serviceType it identifies what was billed. */
  sourceId?: string | null
  /** Period this line covers (service date for usage lines). */
  serviceStartDate?: string | null
  serviceEndDate?: string | null
  /** Reconciliation line for a previous period (package adjustment). */
  isAdjustment?: boolean
  isDeleted?: boolean
}

export type ServicesInvoiceCreationAttributes = Optional<
  ServicesInvoiceAttributes,
  | 'id'
  | 'description'
  | 'residentId'
  | 'familyMemberId'
  | 'consumerType'
  | 'consumerName'
  | 'sourceId'
  | 'serviceStartDate'
  | 'serviceEndDate'
  | 'isAdjustment'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ServicesInvoice
  extends BaseModel<ServicesInvoiceAttributes, ServicesInvoiceCreationAttributes>
  implements ServicesInvoiceAttributes
{
  declare invoiceId: string
  declare serviceType: ServiceType
  declare name: string
  declare description: string | null
  declare quantity: number
  declare price: number
  declare total: number
  declare residentId: string | null
  declare familyMemberId: string | null
  declare consumerType: 'RESIDENT' | 'FAMILY_MEMBER' | null
  declare consumerName: string | null
  declare sourceId: string | null
  declare serviceStartDate: string | null
  declare serviceEndDate: string | null
  declare isAdjustment: boolean
  declare isDeleted: boolean

  declare invoice?: Invoice
  declare resident?: Resident
}

const num = (field: keyof ServicesInvoiceAttributes, type: DataTypes.DataType) => ({
  type,
  allowNull: false,
  defaultValue: 0,
  get(this: ServicesInvoice) {
    return Number(this.getDataValue(field) ?? 0)
  },
})

ServicesInvoice.init(
  {
    ...baseModelColumns,
    invoiceId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> invoices.id' },
    serviceType: { type: DataTypes.ENUM(...Object.values(ServiceType)), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    quantity: num('quantity', DataTypes.DECIMAL(12, 3)),
    price: num('price', DataTypes.DECIMAL(12, 2)),
    total: num('total', DataTypes.DECIMAL(12, 2)),
    residentId: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> residents.id' },
    familyMemberId: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> resident_family_members.id' },
    consumerType: { type: DataTypes.ENUM('RESIDENT', 'FAMILY_MEMBER'), allowNull: true },
    consumerName: { type: DataTypes.STRING(255), allowNull: true },
    sourceId: { type: DataTypes.STRING(64), allowNull: true },
    serviceStartDate: { type: DataTypes.DATEONLY, allowNull: true },
    serviceEndDate: { type: DataTypes.DATEONLY, allowNull: true },
    isAdjustment: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'services_invoice',
    timestamps: true,
  },
)

export default ServicesInvoice
