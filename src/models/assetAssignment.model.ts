import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { AssigneeType } from '../enums/asset/index.js'

export interface AssetAssignmentAttributes extends BaseAttributes {
  assetId: string
  assigneeType: AssigneeType
  assigneeId: string
  bedId?: string | null
  roomId?: string | null
  locationId: string
  assignedBy: string
  assignedAt: Date
  expectedReturnDate?: Date | null
  returnedAt?: Date | null
  returnCondition?: string | null
  notes?: string | null
}

export type AssetAssignmentCreationAttributes = Optional<
  AssetAssignmentAttributes,
  | 'id'
  | 'bedId'
  | 'roomId'
  | 'expectedReturnDate'
  | 'returnedAt'
  | 'returnCondition'
  | 'notes'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AssetAssignment
  extends BaseModel<AssetAssignmentAttributes, AssetAssignmentCreationAttributes>
  implements AssetAssignmentAttributes
{
  declare assetId: string
  declare assigneeType: AssigneeType
  declare assigneeId: string
  declare bedId: string | null
  declare roomId: string | null
  declare locationId: string
  declare assignedBy: string
  declare assignedAt: Date
  declare expectedReturnDate: Date | null
  declare returnedAt: Date | null
  declare returnCondition: string | null
  declare notes: string | null
}

AssetAssignment.init(
  {
    ...baseModelColumns,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    assigneeType: {
      type: DataTypes.ENUM(...Object.values(AssigneeType)),
      allowNull: false,
    },
    assigneeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    bedId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    roomId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    expectedReturnDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    returnedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    returnCondition: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_assignments',
    timestamps: true,
  },
)

export default AssetAssignment
