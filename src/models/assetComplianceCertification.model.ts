import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { CertificationType, ComplianceStatus } from '../enums/asset.enum.js'

export interface AssetComplianceCertificationAttributes extends BaseAttributes {
  assetId: string
  certificationType: CertificationType
  certificateNumber?: string | null
  issuingAuthority?: string | null
  issueDate: Date
  expiryDate: Date
  documentUrl?: string | null
  status: ComplianceStatus
}

export type AssetComplianceCertificationCreationAttributes = Optional<
  AssetComplianceCertificationAttributes,
  | 'id'
  | 'certificateNumber'
  | 'issuingAuthority'
  | 'documentUrl'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AssetComplianceCertification
  extends BaseModel<AssetComplianceCertificationAttributes, AssetComplianceCertificationCreationAttributes>
  implements AssetComplianceCertificationAttributes
{
  declare assetId: string
  declare certificationType: CertificationType
  declare certificateNumber: string | null
  declare issuingAuthority: string | null
  declare issueDate: Date
  declare expiryDate: Date
  declare documentUrl: string | null
  declare status: ComplianceStatus
}

AssetComplianceCertification.init(
  {
    ...baseModelColumns,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    certificationType: {
      type: DataTypes.ENUM(...Object.values(CertificationType)),
      allowNull: false,
    },
    certificateNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    issuingAuthority: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    issueDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    documentUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(ComplianceStatus)),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'asset_compliance_certifications',
    timestamps: true,
  },
)

export default AssetComplianceCertification
