import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BillingEventSourceModule, BillingEventStatus } from '../enums/billing.enum.js'

import type { BillingAccount } from './billingAccount.model.js'
import type { Resident } from './resident.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'
import type { BillingProduct } from './billingProduct.model.js'

// BillingEvent does NOT extend BaseModel — it is intentionally immutable.
// No createdBy/updatedBy (events come from modules, not users directly).
// No updatedAt (enforces immutability — wrong event = cancel + compensate).
import { Model } from 'sequelize'

export interface BillingEventAttributes {
  id: string
  billingAccountId: string
  unitId: string
  residentId: string
  propertyId: string
  sourceModule: BillingEventSourceModule
  sourceType: string
  sourceId?: string | null
  productId?: string | null
  chargeType: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  serviceDate: Date | string
  occurredAt?: Date
  status: BillingEventStatus
  invoiceId?: string | null
  invoiceLineId?: string | null
  cancellationReason?: string | null
  cancelledAt?: Date | null
  createdAt?: Date
}

export type BillingEventCreationAttributes = Optional<
  BillingEventAttributes,
  | 'id'
  | 'sourceId'
  | 'productId'
  | 'quantity'
  | 'unitPrice'
  | 'amount'
  | 'occurredAt'
  | 'status'
  | 'invoiceId'
  | 'invoiceLineId'
  | 'cancellationReason'
  | 'cancelledAt'
  | 'createdAt'
>

export class BillingEvent
  extends Model<BillingEventAttributes, BillingEventCreationAttributes>
  implements BillingEventAttributes
{
  declare id: string
  declare billingAccountId: string
  declare unitId: string
  declare residentId: string
  declare propertyId: string
  declare sourceModule: BillingEventSourceModule
  declare sourceType: string
  declare sourceId: string | null
  declare productId: string | null
  declare chargeType: string
  declare description: string
  declare quantity: number
  declare unitPrice: number
  declare amount: number
  declare serviceDate: Date | string
  declare occurredAt: Date
  declare status: BillingEventStatus
  declare invoiceId: string | null
  declare invoiceLineId: string | null
  declare cancellationReason: string | null
  declare cancelledAt: Date | null
  declare readonly createdAt: Date

  // Associations
  declare billingAccount?: BillingAccount
  declare resident?: Resident
  declare unit?: PropertyUnit
  declare product?: BillingProduct
}

BillingEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    billingAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    sourceModule: {
      type: DataTypes.ENUM('FNB', 'CARE', 'TRANSPORT', 'ACTIVITY', 'INVENTORY', 'HOUSEKEEPING', 'MANUAL', 'SYSTEM'),
      allowNull: false,
    },
    sourceType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    sourceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    productId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    chargeType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 1.0,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    serviceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    occurredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'INVOICED', 'CANCELLED'),
      allowNull: false,
      defaultValue: BillingEventStatus.PENDING,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    invoiceLineId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    cancellationReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'billing_events',
    timestamps: false, // We manage createdAt manually — no updatedAt (immutable)
  },
)

export default BillingEvent

