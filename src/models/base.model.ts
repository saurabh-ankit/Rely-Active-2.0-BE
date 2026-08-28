import { DataTypes, Model, Optional } from 'sequelize'

export interface BaseAttributes {
  id: string
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type BaseCreationAttributes = Optional<
  BaseAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export abstract class BaseModel<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TAttributes extends BaseAttributes = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TCreationAttributes extends object = any,
> extends Model<TAttributes, TCreationAttributes> {
  declare id: string
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

export const baseModelColumns = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  createdBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
  updatedBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
}
