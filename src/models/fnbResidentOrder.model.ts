import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { FnbOrderStatus, FnbOrderType, FnbServiceType } from '../enums/fnb.enum.js'
import type { Resident } from './resident.model.js'
import type { ResidentFamilyMember } from './residentFamilyMember.model.js'
import type { FnbResidentOrderDetail } from './fnbResidentOrderDetail.model.js'
import type { FnbPropertySpecialSlot } from './fnbPropertySpecialSlot.model.js'

import type { FnbFoodDelivery } from './fnbFoodDelivery.model.js'

export interface FnbResidentOrderAttributes extends BaseAttributes {
  locId: string
  residentId?: string | null
  familyMemberId?: string | null
  residentPackageId?: string | null
  date: Date | string
  mealSlotId?: string | null
  specialMealSlotId?: string | null
  isDish?: number
  orderType?: string
  selectionType?: string
  serviceType?: string
  quantity?: number
  unitPrice?: number
  totalAmount: number
  isPackageCovered: boolean
  orderStatus: FnbOrderStatus | string
  acceptedAt?: Date | string | null
  preparingStartedAt?: Date | string | null
  readyAt?: Date | string | null
  deliveredAt?: Date | string | null
  deliveryCharge?: number
  assignedEmployeeId?: string | null
  menuItemId?: string | null
  dishId?: string | null
  mealSlot?: string | null
}

export type FnbResidentOrderCreationAttributes = Optional<
  FnbResidentOrderAttributes,
  | 'id'
  | 'residentId'
  | 'familyMemberId'
  | 'residentPackageId'
  | 'mealSlotId'
  | 'specialMealSlotId'
  | 'isDish'
  | 'orderType'
  | 'selectionType'
  | 'serviceType'
  | 'quantity'
  | 'unitPrice'
  | 'totalAmount'
  | 'isPackageCovered'
  | 'orderStatus'
  | 'acceptedAt'
  | 'preparingStartedAt'
  | 'readyAt'
  | 'deliveredAt'
  | 'deliveryCharge'
  | 'assignedEmployeeId'
  | 'menuItemId'
  | 'dishId'
  | 'mealSlot'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class FnbResidentOrder
  extends BaseModel<FnbResidentOrderAttributes, FnbResidentOrderCreationAttributes>
  implements FnbResidentOrderAttributes
{
  declare locId: string
  declare residentId: string | null
  declare familyMemberId: string | null
  declare residentPackageId: string | null
  declare date: Date | string
  declare mealSlotId: string | null
  declare specialMealSlotId: string | null
  declare isDish: number
  declare orderType: string
  declare selectionType: string
  declare serviceType: string
  declare quantity: number
  declare unitPrice: number
  declare totalAmount: number
  declare isPackageCovered: boolean
  declare orderStatus: FnbOrderStatus | string
  declare acceptedAt: Date | string | null
  declare preparingStartedAt: Date | string | null
  declare readyAt: Date | string | null
  declare deliveredAt: Date | string | null
  declare deliveryCharge: number
  declare assignedEmployeeId: string | null

  declare resident?: Resident
  declare familyMember?: ResidentFamilyMember
  declare globalMealSlot?: unknown
  declare specialMealSlot?: FnbPropertySpecialSlot
  declare details?: FnbResidentOrderDetail[]
  declare delivery?: FnbFoodDelivery
}

FnbResidentOrder.init(
  {
    ...baseModelColumns,
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    residentPackageId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    mealSlotId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    specialMealSlotId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    isDish: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    orderType: {
      type: DataTypes.ENUM('personal', 'guest', 'special', 'custom'),
      allowNull: false,
      defaultValue: FnbOrderType.PERSONAL,
    },
    selectionType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'dish',
    },
    serviceType: {
      type: DataTypes.ENUM('dine_in', 'room_service'),
      allowNull: false,
      defaultValue: FnbServiceType.ROOM_SERVICE,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('unitPrice')
        return val !== null ? Number(val) : 0
      },
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('totalAmount')
        return val !== null ? Number(val) : 0
      },
    },
    isPackageCovered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    orderStatus: {
      type: DataTypes.ENUM(
        'placed',
        'accepted',
        'preparing',
        'ready',
        'delivering_to_room',
        'completed',
        'delivered',
        'cancelled',
      ),
      allowNull: false,
      defaultValue: FnbOrderStatus.PLACED,
    },
    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    preparingStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    readyAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveryCharge: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('deliveryCharge')
        return val !== null ? Number(val) : 0
      },
    },
    assignedEmployeeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'fnb_resident_orders',
    timestamps: true,
  },
)

export default FnbResidentOrder
