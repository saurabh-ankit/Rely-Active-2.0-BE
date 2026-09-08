import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Property } from './property.model.js'

export type PriceOption = 'Daily' | 'Monthly' | 'Session Wise'

export interface CareTaskAttributes extends BaseAttributes {
  careTaskName: string
  careTaskDescription?: string | null
  dailyRate: number
  monthlyRate: number
  sessionRate: number
  sessionWiseRate?: number
  careTaskPrice?: number | null
  priceOption?: PriceOption | string | null
  careTaskImage?: string | null
  propertyId?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type CareTaskCreationAttributes = Optional<
  CareTaskAttributes,
  | 'id'
  | 'careTaskDescription'
  | 'dailyRate'
  | 'monthlyRate'
  | 'sessionRate'
  | 'sessionWiseRate'
  | 'careTaskPrice'
  | 'priceOption'
  | 'careTaskImage'
  | 'propertyId'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class CareTask extends BaseModel<CareTaskAttributes, CareTaskCreationAttributes> implements CareTaskAttributes {
  declare careTaskName: string
  declare careTaskDescription: string | null
  declare dailyRate: number
  declare monthlyRate: number
  declare sessionRate: number
  declare sessionWiseRate?: number
  declare careTaskPrice?: number | null
  declare priceOption?: PriceOption | string | null
  declare careTaskImage: string | null
  declare propertyId: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare property?: Property
}

CareTask.init(
  {
    ...baseModelColumns,
    careTaskName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    careTaskDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dailyRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('dailyRate')
        return val !== null && val !== undefined ? Number(val) : 0
      },
    },
    monthlyRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('monthlyRate')
        return val !== null && val !== undefined ? Number(val) : 0
      },
    },
    sessionRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('sessionRate')
        return val !== null && val !== undefined ? Number(val) : 0
      },
    },
    sessionWiseRate: {
      type: DataTypes.VIRTUAL,
      get() {
        const val = this.getDataValue('sessionRate')
        return val !== null && val !== undefined ? Number(val) : 0
      },
      set(val: unknown) {
        this.setDataValue('sessionRate', Number(val) || 0)
      },
    },
    careTaskPrice: {
      type: DataTypes.VIRTUAL,
      get() {
        const m = Number(this.getDataValue('monthlyRate')) || 0
        const d = Number(this.getDataValue('dailyRate')) || 0
        const s = Number(this.getDataValue('sessionRate')) || 0
        return m || d || s || 0
      },
    },
    priceOption: {
      type: DataTypes.VIRTUAL,
      get() {
        const m = Number(this.getDataValue('monthlyRate')) || 0
        const d = Number(this.getDataValue('dailyRate')) || 0
        const s = Number(this.getDataValue('sessionRate')) || 0
        if (m > 0) return 'Monthly'
        if (d > 0) return 'Daily'
        if (s > 0) return 'Session Wise'
        return null
      },
    },
    careTaskImage: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'care_tasks',
    timestamps: true,
  },
)

export default CareTask
