import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface TicketSubCategoryAttributes extends BaseAttributes {
  categoryId: string
  name: string
  code?: string | null
  description?: string | null
  isActive: boolean
}

export type TicketSubCategoryCreationAttributes = Optional<
  TicketSubCategoryAttributes,
  'id' | 'code' | 'description' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class TicketSubCategory
  extends BaseModel<TicketSubCategoryAttributes, TicketSubCategoryCreationAttributes>
  implements TicketSubCategoryAttributes
{
  declare categoryId: string
  declare name: string
  declare code: string | null
  declare description: string | null
  declare isActive: boolean
}

TicketSubCategory.init(
  {
    ...baseModelColumns,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'ticket_sub_categories',
    timestamps: true,
  },
)
