import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BillingRunStatus, BillingRunType } from '../enums/billing.enum.js'

export interface BillingRunAttributes {
  id: string
  propertyId: string
  companyId: string
  billingPeriodStart: Date | string
  billingPeriodEnd: Date | string
  runType: BillingRunType
  status: BillingRunStatus
  totalAccounts: number
  successfulInvoices: number
  failedInvoices: number
  totalAmount: number
  startedAt?: Date | null
  completedAt?: Date | null
  runBy?: string | null
  createdAt?: Date
}

export type BillingRunCreationAttributes = Optional<
  BillingRunAttributes,
  | 'id'
  | 'runType'
  | 'status'
  | 'totalAccounts'
  | 'successfulInvoices'
  | 'failedInvoices'
  | 'totalAmount'
  | 'startedAt'
  | 'completedAt'
  | 'runBy'
  | 'createdAt'
>

export class BillingRun
  extends Model<BillingRunAttributes, BillingRunCreationAttributes>
  implements BillingRunAttributes
{
  declare id: string
  declare propertyId: string
  declare companyId: string
  declare billingPeriodStart: Date | string
  declare billingPeriodEnd: Date | string
  declare runType: BillingRunType
  declare status: BillingRunStatus
  declare totalAccounts: number
  declare successfulInvoices: number
  declare failedInvoices: number
  declare totalAmount: number
  declare startedAt: Date | null
  declare completedAt: Date | null
  declare runBy: string | null
  declare readonly createdAt: Date
}

BillingRun.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    propertyId: { type: DataTypes.UUID, allowNull: false },
    companyId: { type: DataTypes.UUID, allowNull: false },
    billingPeriodStart: { type: DataTypes.DATEONLY, allowNull: false },
    billingPeriodEnd: { type: DataTypes.DATEONLY, allowNull: false },
    runType: {
      type: DataTypes.ENUM('SCHEDULED', 'MANUAL', 'PREVIEW'),
      allowNull: false,
      defaultValue: BillingRunType.MANUAL,
    },
    status: {
      type: DataTypes.ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'),
      allowNull: false,
      defaultValue: BillingRunStatus.QUEUED,
    },
    totalAccounts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    successfulInvoices: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failedInvoices: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0.0 },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    runBy: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'billing_runs',
    timestamps: false, // Only createdAt, no updatedAt (append-heavy status tracker)
  },
)

export default BillingRun
