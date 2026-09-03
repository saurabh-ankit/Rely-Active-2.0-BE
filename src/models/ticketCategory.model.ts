import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface TicketCategoryAttributes extends BaseAttributes {
  name: string
  code?: string | null
  description?: string | null
  isActive: boolean
}

export type TicketCategoryCreationAttributes = Optional<
  TicketCategoryAttributes,
  'id' | 'code' | 'description' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class TicketCategory
  extends BaseModel<TicketCategoryAttributes, TicketCategoryCreationAttributes>
  implements TicketCategoryAttributes
{
  declare name: string
  declare code: string | null
  declare description: string | null
  declare isActive: boolean
}

TicketCategory.init(
  {
    ...baseModelColumns,
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
    tableName: 'ticket_categories',
    timestamps: true,
  },
)
