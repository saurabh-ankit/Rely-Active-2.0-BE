import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { InventoryItem } from './inventoryItem.model.js'
import type { DoctorAppointment } from './doctorAppointment.model.js'
import type { MedicationTiming } from './residentMedication.model.js'

export interface ResidentInsulinAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  appointmentId?: string | null
  inventoryItemId: string
  medicineName: string
  startDate: string
  endDate?: string | null
  isUntilDischarge: boolean
  timings: MedicationTiming[]
  note?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentInsulinCreationAttributes = Optional<
  ResidentInsulinAttributes,
  | 'id'
  | 'appointmentId'
  | 'endDate'
  | 'note'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentInsulin
  extends BaseModel<ResidentInsulinAttributes, ResidentInsulinCreationAttributes>
  implements ResidentInsulinAttributes
{
  declare residentId: string
  declare locationId: string
  declare appointmentId: string | null
  declare inventoryItemId: string
  declare medicineName: string
  declare startDate: string
  declare endDate: string | null
  declare isUntilDischarge: boolean
  declare timings: MedicationTiming[]
  declare note: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare inventoryItem?: InventoryItem
  declare appointment?: DoctorAppointment
}

ResidentInsulin.init(
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
    appointmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> doctor_appointments.id (optional visit context)',
    },
    inventoryItemId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> inventory_items.id',
    },
    medicineName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    isUntilDischarge: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    timings: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'resident_insulin',
    timestamps: true,
    indexes: [
      { fields: ['residentId'], name: 'idx_resident_insulin_resident' },
      { fields: ['locationId'], name: 'idx_resident_insulin_location' },
      { fields: ['inventoryItemId'], name: 'idx_resident_insulin_item' },
    ],
  },
)

export default ResidentInsulin
