import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

/** Which dashboard tabs a company shows. One row per company; applies to every property of that company. */
export interface CompanyDashboardSettingAttributes extends BaseAttributes {
  companyId: string
  visibleTabs: string[]
}

export type CompanyDashboardSettingCreationAttributes = Optional<
  CompanyDashboardSettingAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class CompanyDashboardSetting
  extends BaseModel<CompanyDashboardSettingAttributes, CompanyDashboardSettingCreationAttributes>
  implements CompanyDashboardSettingAttributes
{
  declare companyId: string
  declare visibleTabs: string[]
}

CompanyDashboardSetting.init(
  {
    ...baseModelColumns,
    companyId: { type: DataTypes.UUID, allowNull: false, unique: true },
    visibleTabs: { type: DataTypes.JSON, allowNull: false },
  },
  { sequelize, tableName: 'company_dashboard_settings', timestamps: true },
)

export default CompanyDashboardSetting
