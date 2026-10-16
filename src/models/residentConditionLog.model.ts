import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { DiagnosisCondition } from '../enums/diagnosis.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { User } from './user.model.js'

export interface ResidentConditionLogAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  condition: DiagnosisCondition
  note?: string | null
  isDeleted?: boolean
}

export type ResidentConditionLogCreationAttributes = Optional<
  ResidentConditionLogAttributes,
  'id' | 'note' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ResidentConditionLog
  extends BaseModel<ResidentConditionLogAttributes, ResidentConditionLogCreationAttributes>
  implements ResidentConditionLogAttributes
{
  declare residentId: string
  declare locationId: string
  declare condition: DiagnosisCondition
  declare note: string | null
  declare isDeleted: boolean

  declare resident?: Resident
  declare creator?: User
}

ResidentConditionLog.init(
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
    condition: {
      type: DataTypes.ENUM(...Object.values(DiagnosisCondition)),
      allowNull: false,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'resident_condition_logs',
    timestamps: true,
    indexes: [{ fields: ['residentId', 'createdAt'], name: 'idx_resident_condition_logs_resident_created' }],
  },
)

export default ResidentConditionLog
