import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { BillingPartyRole, BillingPartyType } from '../enums/billing.enum.js'

import type { BillingAccount } from './billingAccount.model.js'
import type { Resident } from './resident.model.js'
import type { ResidentFamilyMember } from './residentFamilyMember.model.js'

export interface BillingPartyAttributes extends BaseAttributes {
  billingAccountId: string
  partyType: BillingPartyType
  residentId?: string | null
  familyMemberId?: string | null
  partyName: string
  partyEmail?: string | null
  partyPhone?: string | null
  partyAddress?: string | null
  partyGstin?: string | null
  role: BillingPartyRole
  isDefault: boolean
  isActive?: boolean
}

export type BillingPartyCreationAttributes = Optional<
  BillingPartyAttributes,
  | 'id'
  | 'residentId'
  | 'familyMemberId'
  | 'partyEmail'
  | 'partyPhone'
  | 'partyAddress'
  | 'partyGstin'
  | 'role'
  | 'isDefault'
  | 'isActive'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class BillingParty
  extends BaseModel<BillingPartyAttributes, BillingPartyCreationAttributes>
  implements BillingPartyAttributes
{
  declare billingAccountId: string
  declare partyType: BillingPartyType
  declare residentId: string | null
  declare familyMemberId: string | null
  declare partyName: string
  declare partyEmail: string | null
  declare partyPhone: string | null
  declare partyAddress: string | null
  declare partyGstin: string | null
  declare role: BillingPartyRole
  declare isDefault: boolean
  declare isActive: boolean

  // Associations
  declare billingAccount?: BillingAccount
  declare resident?: Resident
  declare familyMember?: ResidentFamilyMember
}

BillingParty.init(
  {
    ...baseModelColumns,
    billingAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> billing_accounts.id',
    },
    partyType: {
      type: DataTypes.ENUM('RESIDENT', 'FAMILY_MEMBER', 'GUARDIAN', 'ORGANIZATION', 'OTHER'),
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    partyName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    partyEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    partyPhone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    partyAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    partyGstin: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM('PRIMARY_PAYER', 'SECONDARY_PAYER', 'AUTHORIZED_CONTACT'),
      allowNull: false,
      defaultValue: BillingPartyRole.PRIMARY_PAYER,
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'billing_parties',
    timestamps: true,
  },
)

export default BillingParty
