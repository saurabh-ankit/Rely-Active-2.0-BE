import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

/** An item an office visitor carries through the gate, checked off by the guard on the way out. */
export interface GateEntryItemAttributes extends BaseAttributes {
  entryId: string
  itemName: string
  quantity: number
  isChecked: boolean
}

export type GateEntryItemCreationAttributes = Optional<
  GateEntryItemAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'quantity' | 'isChecked'
>

export class GateEntryItem
  extends BaseModel<GateEntryItemAttributes, GateEntryItemCreationAttributes>
  implements GateEntryItemAttributes
{
  declare entryId: string
  declare itemName: string
  declare quantity: number
  declare isChecked: boolean
}

GateEntryItem.init(
  {
    ...baseModelColumns,
    entryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'gate_entries', key: 'id' },
      onDelete: 'CASCADE',
    },
    itemName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    isChecked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'gate_entry_items',
    timestamps: true,
  },
)

export default GateEntryItem
