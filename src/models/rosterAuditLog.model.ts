import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface RosterAuditLogAttributes extends BaseAttributes {
  companyId: string
  locationId: string
  entityType: string
  entityId: string
  action: string
  previousValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  overrideReason?: string | null
  performedBy: string
}

export type RosterAuditLogCreationAttributes = Optional<
  RosterAuditLogAttributes,
  'id' | 'previousValues' | 'newValues' | 'overrideReason' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class RosterAuditLog
  extends BaseModel<RosterAuditLogAttributes, RosterAuditLogCreationAttributes>
  implements RosterAuditLogAttributes
{
  declare companyId: string
  declare locationId: string
  declare entityType: string
  declare entityId: string
  declare action: string
  declare previousValues: Record<string, unknown> | null
  declare newValues: Record<string, unknown> | null
  declare overrideReason: string | null
  declare performedBy: string
}

RosterAuditLog.init(
  {
    ...baseModelColumns,
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    previousValues: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    newValues: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    overrideReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    performedBy: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_audit_logs',
    timestamps: true,
  },
)

export default RosterAuditLog
