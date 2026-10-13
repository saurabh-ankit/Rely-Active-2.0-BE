import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'

export interface ResidentDocumentAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  name: string
  fileUrl: string
  fileName?: string | null
  mimeType?: string | null
  note?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentDocumentCreationAttributes = Optional<
  ResidentDocumentAttributes,
  | 'id'
  | 'fileName'
  | 'mimeType'
  | 'note'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentDocument
  extends BaseModel<ResidentDocumentAttributes, ResidentDocumentCreationAttributes>
  implements ResidentDocumentAttributes
{
  declare residentId: string
  declare locationId: string
  declare name: string
  declare fileUrl: string
  declare fileName: string | null
  declare mimeType: string | null
  declare note: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
}

ResidentDocument.init(
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fileUrl: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: true,
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
    tableName: 'resident_documents',
    timestamps: true,
    indexes: [
      { fields: ['residentId'], name: 'idx_resident_documents_resident' },
      { fields: ['isDeleted', 'createdAt'], name: 'idx_resident_documents_deleted_created' },
    ],
  },
)

export default ResidentDocument
