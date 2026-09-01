import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type RosterDateDutyType = 'SHIFT' | 'OPD_SESSION'
export type RosterAttendanceStatus = 'NOT_MARKED' | 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE'

export type RosterDateStatus =
  | 'UPCOMING'
  | 'ON_DUTY'
  | 'COMPLETED'
  | 'ABSENT'
  | 'COVERED'
  | 'REPLACEMENT_REQUIRED'
  | 'REPLACED'
  | 'CANCELLED'

export interface RosterAssignmentDateAttributes extends BaseAttributes {
  companyId: string
  locationId: string
  rosterAssignmentId: string
  assignmentDate: string
  dutyType?: RosterDateDutyType
  attendanceStatus?: RosterAttendanceStatus
  schedulingResourceId: string
  shiftId?: string | null
  scheduledStart: Date
  scheduledEnd: Date
  slotTimeRange: string
  shiftNameSnapshot: string
  targetSnapshot: string
  resourceSnapshot: string
  slotCapacitySnapshot?: number | null
  status?: RosterDateStatus
  activeToken?: string
  coveredByResourceId?: string | null
  cancellationReason?: string | null
  cancelledBy?: string | null
  cancelledAt?: Date | null
  overrideReason?: string | null
  markedBy?: string | null
  markedAt?: Date | null
  isDeleted?: boolean
}

export type RosterAssignmentDateCreationAttributes = Optional<
  RosterAssignmentDateAttributes,
  | 'id'
  | 'dutyType'
  | 'attendanceStatus'
  | 'shiftId'
  | 'slotCapacitySnapshot'
  | 'status'
  | 'activeToken'
  | 'coveredByResourceId'
  | 'cancellationReason'
  | 'cancelledBy'
  | 'cancelledAt'
  | 'overrideReason'
  | 'markedBy'
  | 'markedAt'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterAssignmentDate
  extends BaseModel<RosterAssignmentDateAttributes, RosterAssignmentDateCreationAttributes>
  implements RosterAssignmentDateAttributes
{
  declare companyId: string
  declare locationId: string
  declare rosterAssignmentId: string
  declare assignmentDate: string
  declare dutyType: RosterDateDutyType
  declare attendanceStatus: RosterAttendanceStatus
  declare schedulingResourceId: string
  declare shiftId: string | null
  declare scheduledStart: Date
  declare scheduledEnd: Date
  declare slotTimeRange: string
  declare shiftNameSnapshot: string
  declare targetSnapshot: string
  declare resourceSnapshot: string
  declare slotCapacitySnapshot: number | null
  declare status: RosterDateStatus
  declare activeToken: string
  declare coveredByResourceId: string | null
  declare cancellationReason: string | null
  declare cancelledBy: string | null
  declare cancelledAt: Date | null
  declare overrideReason: string | null
  declare markedBy: string | null
  declare markedAt: Date | null
  declare isDeleted: boolean
}

RosterAssignmentDate.init(
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
    rosterAssignmentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    assignmentDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    dutyType: {
      type: DataTypes.ENUM('SHIFT', 'OPD_SESSION'),
      field: 'duty_type',
      allowNull: false,
      defaultValue: 'SHIFT',
    },
    attendanceStatus: {
      type: DataTypes.ENUM('NOT_MARKED', 'PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE'),
      field: 'attendance_status',
      allowNull: false,
      defaultValue: 'NOT_MARKED',
    },
    schedulingResourceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    shiftId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    scheduledStart: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    scheduledEnd: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    slotTimeRange: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    shiftNameSnapshot: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    targetSnapshot: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    resourceSnapshot: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    slotCapacitySnapshot: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        'UPCOMING',
        'ON_DUTY',
        'COMPLETED',
        'ABSENT',
        'COVERED',
        'REPLACEMENT_REQUIRED',
        'REPLACED',
        'CANCELLED',
      ),
      allowNull: false,
      defaultValue: 'UPCOMING',
    },
    activeToken: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    coveredByResourceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    cancellationReason: {
      type: DataTypes.STRING(255),
      field: 'cancellation_reason',
      allowNull: true,
    },
    cancelledBy: {
      type: DataTypes.STRING(100),
      field: 'cancelled_by',
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      field: 'cancelled_at',
      allowNull: true,
    },
    overrideReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    markedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    markedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_assignment_dates',
    timestamps: true,
  },
)

export default RosterAssignmentDate
