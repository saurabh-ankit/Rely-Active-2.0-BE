import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { FnbMenuStatus } from '../enums/fnb.enum.js'
import type { FnbMenuItem } from './fnbMenuItem.model.js'

export interface FnbMenuAttributes extends BaseAttributes {
  locId: string
  title: string
  status: FnbMenuStatus
}

export type FnbMenuCreationAttributes = Optional<
  FnbMenuAttributes,
  'id' | 'status' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class FnbMenu extends BaseModel<FnbMenuAttributes, FnbMenuCreationAttributes> implements FnbMenuAttributes {
  declare locId: string
  declare title: string
  declare status: FnbMenuStatus

  declare menuItems?: FnbMenuItem[]
}

FnbMenu.init(
  {
    ...baseModelColumns,
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: FnbMenuStatus.DRAFT,
    },
  },
  {
    sequelize,
    tableName: 'fnb_menus',
    timestamps: true,
  },
)

export default FnbMenu
