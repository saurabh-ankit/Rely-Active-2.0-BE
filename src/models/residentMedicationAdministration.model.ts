import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { User } from './user.model.js'
import type { InventoryItem } from './inventoryItem.model.js'
import type { ConsultantFileEntry } from './consultant.model.js'
import type { MedicationTimeOfDay } from './residentMedication.model.js'
import {
  MedicationAdministrationStatus,
  MedicationKind,
  MedicationMealTiming,
  MedicationRoute,
  MedicationStockStatus,
} from '../enums/medication.enum.js'

export interface ResidentMedicationAdministrationAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  kind: MedicationKind
  medicationId: string
  inventoryItemId: string
  medicineName: string
  timeOfDay: MedicationTimeOfDay
  scheduledDate: string
  scheduledTime: string
  dose: number
  route: MedicationRoute
  mealTiming: MedicationMealTiming
  status: MedicationAdministrationStatus
  completedBy?: string | null
  completedAt?: Date | null
  notes?: string | null
  attachments: ConsultantFileEntry[]
  voiceNotes: ConsultantFileEntry[]
  cancelledBy?: string | null
  cancelledAt?: Date | null
  cancelReason?: string | null
  cancelAttachments?: ConsultantFileEntry[] | null
  cancelVoiceNotes?: ConsultantFileEntry[] | null
  stockStatus: MedicationStockStatus
  deductedQuantity: number
  stockTransactionId?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentMedicationAdministrationCreationAttributes = Optional<
  ResidentMedicationAdministrationAttributes,
  | 'id'
  | 'status'
  | 'completedBy'
  | 'completedAt'
  | 'cancelledBy'
  | 'cancelledAt'
  | 'cancelReason'
  | 'cancelAttachments'
  | 'cancelVoiceNotes'
  | 'notes'
  | 'attachments'
  | 'voiceNotes'
  | 'stockStatus'
  | 'deductedQuantity'
  | 'stockTransactionId'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentMedicationAdministration
  extends BaseModel<ResidentMedicationAdministrationAttributes, ResidentMedicationAdministrationCreationAttributes>
  implements ResidentMedicationAdministrationAttributes
{
  declare residentId: string
  declare locationId: string
  declare kind: MedicationKind
  declare medicationId: string
  declare inventoryItemId: string
  declare medicineName: string
  declare timeOfDay: MedicationTimeOfDay
  declare scheduledDate: string
  declare scheduledTime: string
  declare dose: number
  declare route: MedicationRoute
  declare mealTiming: MedicationMealTiming
  declare status: MedicationAdministrationStatus
  declare completedBy: string | null
  declare completedAt: Date | null
  declare notes: string | null
  declare attachments: ConsultantFileEntry[]
  declare voiceNotes: ConsultantFileEntry[]
  declare cancelledBy: string | null
  declare cancelledAt: Date | null
  declare cancelReason: string | null
  declare cancelAttachments: ConsultantFileEntry[] | null
  declare cancelVoiceNotes: ConsultantFileEntry[] | null
  declare stockStatus: MedicationStockStatus
  declare deductedQuantity: number
  declare stockTransactionId: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare completedByUser?: User
  declare cancelledByUser?: User
  declare inventoryItem?: InventoryItem
}

ResidentMedicationAdministration.init(
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
    kind: {
      type: DataTypes.ENUM(...Object.values(MedicationKind)),
      allowNull: false,
    },
    medicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'resident_medications.id or resident_insulin.id depending on kind',
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
    timeOfDay: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    scheduledDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    scheduledTime: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    dose: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('dose')
        return value === null || value === undefined ? 0 : Number(value)
      },
    },
    route: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    mealTiming: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(MedicationAdministrationStatus)),
      allowNull: false,
      defaultValue: MedicationAdministrationStatus.COMPLETED,
    },
    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> users.id; null while the dose is cancelled',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    voiceNotes: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    cancelledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> users.id',
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancelAttachments: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    cancelVoiceNotes: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    stockStatus: {
      type: DataTypes.ENUM(...Object.values(MedicationStockStatus)),
      allowNull: false,
      defaultValue: MedicationStockStatus.NOT_APPLICABLE,
    },
    deductedQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    stockTransactionId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> inventory_stock_transactions.id',
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
    tableName: 'resident_medication_administrations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['kind', 'medicationId', 'timeOfDay', 'scheduledDate'],
        name: 'uq_resident_med_admin_slot',
      },
      { fields: ['residentId', 'scheduledDate'], name: 'idx_resident_med_admin_resident_date' },
      { fields: ['completedBy', 'scheduledDate'], name: 'idx_resident_med_admin_nurse_date' },
    ],
  },
)

export default ResidentMedicationAdministration
