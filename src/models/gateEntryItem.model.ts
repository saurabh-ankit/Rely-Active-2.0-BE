import { DataTypes, Sequelize } from 'sequelize'
import { BaseModel, BaseAttributes, baseModelColumns } from './base.model.js'
import GateEntry from './gateEntry.model.js'

export interface GateEntryItemAttributes extends BaseAttributes {
  entryId: string
  itemName: string
  quantity: number
  isChecked: boolean
}

class GateEntryItem extends BaseModel<GateEntryItemAttributes> implements GateEntryItemAttributes {
  public entryId!: string
  public itemName!: string
  public quantity!: number
  public isChecked!: boolean
}

export const initGateEntryItem = (sequelize: Sequelize) => {
  GateEntryItem.init(
    {
      ...baseModelColumns,
      entryId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'gate_entries',
          key: 'id',
        },
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
}

export const setupGateEntryItemAssociations = () => {
  GateEntryItem.belongsTo(GateEntry, { foreignKey: 'entryId', as: 'entry' })
  GateEntry.hasMany(GateEntryItem, { foreignKey: 'entryId', as: 'items' })
}

export default GateEntryItem
