import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import {
  BowelComfortLevel,
  FluidBalanceCategory,
  FluidUnit,
  IvFluidType,
  StoolType,
} from '../enums/fluidBalance.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { User } from './user.model.js'

/** One row per intake, output or bowel movement entry; rows saved together share a batchId. */
export interface ResidentFluidBalanceAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  batchId: string
  category: FluidBalanceCategory
  /** FluidIntakeType for INTAKE rows, FluidOutputType for OUTPUT rows. */
  fluidType?: string | null
  /** Set only on IV fluid intakes. */
  ivFluidType?: IvFluidType | null
  /** Set only on Oral / NG intakes (e.g. Water, Juice). */
  description?: string | null
  /** Set only on OUTPUT rows. */
  collectedBy?: string | null
  quantity?: number | null
  unit?: FluidUnit | null
  quantityMl?: number | null
  stoolType?: StoolType | null
  comfortLevel?: BowelComfortLevel | null
  note?: string | null
  recordedAt: Date
  isDeleted?: boolean
}

export type ResidentFluidBalanceCreationAttributes = Optional<
  ResidentFluidBalanceAttributes,
  | 'id'
  | 'fluidType'
  | 'ivFluidType'
  | 'description'
  | 'collectedBy'
  | 'quantity'
  | 'unit'
  | 'quantityMl'
  | 'stoolType'
  | 'comfortLevel'
  | 'note'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentFluidBalance
  extends BaseModel<ResidentFluidBalanceAttributes, ResidentFluidBalanceCreationAttributes>
  implements ResidentFluidBalanceAttributes
{
  declare residentId: string
  declare locationId: string
  declare batchId: string
  declare category: FluidBalanceCategory
  declare fluidType: string | null
  declare ivFluidType: IvFluidType | null
  declare description: string | null
  declare collectedBy: string | null
  declare quantity: number | null
  declare unit: FluidUnit | null
  declare quantityMl: number | null
  declare stoolType: StoolType | null
  declare comfortLevel: BowelComfortLevel | null
  declare note: string | null
  declare recordedAt: Date
  declare isDeleted: boolean

  declare resident?: Resident
  declare creator?: User
}

ResidentFluidBalance.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> properties.id',
    },
    batchId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM(...Object.values(FluidBalanceCategory)),
      allowNull: false,
    },
    fluidType: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    ivFluidType: {
      type: DataTypes.ENUM(...Object.values(IvFluidType)),
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    collectedBy: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    unit: {
      type: DataTypes.ENUM(...Object.values(FluidUnit)),
      allowNull: true,
    },
    quantityMl: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    stoolType: {
      type: DataTypes.ENUM(...Object.values(StoolType)),
      allowNull: true,
    },
    comfortLevel: {
      type: DataTypes.ENUM(...Object.values(BowelComfortLevel)),
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    recordedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'resident_fluid_balances',
    timestamps: true,
    indexes: [{ fields: ['residentId', 'recordedAt'], name: 'idx_resident_fluid_balances_resident_recorded' }],
  },
)

export default ResidentFluidBalance
