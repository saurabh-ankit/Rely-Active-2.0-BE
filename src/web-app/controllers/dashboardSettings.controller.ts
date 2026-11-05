import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { CompanyDashboardSetting } from '../../models/index.js'
import { scopedQuery, userNameSql } from '../../services/dashboardQuery.service.js'
import { DASHBOARD_TABS, type UpdateDashboardSettingsInput } from '../../validations/dashboard.validation.js'

/**
 * Which dashboard tabs are shown. The choice is stored per company, so it applies to every
 * property of that company and every user who opens the dashboard there.
 */

const EDITOR_ROLES = ['SUPER_ADMIN', 'ADMIN']

const canEdit = (req: AuthenticatedRequest) => (req.user?.roles ?? []).some((r) => EDITOR_ROLES.includes(r))

/** Keep known tabs in display order; the Dashboard tab is always on. */
const normaliseTabs = (tabs: readonly string[]) => DASHBOARD_TABS.filter((t) => t === 'dashboard' || tabs.includes(t))

/**
 * The user's company. Users usually have no `companyId` of their own, so fall back to the company
 * of a property they are assigned to, then of the property being viewed.
 */
async function resolveCompanyId(req: AuthenticatedRequest): Promise<string | null> {
  if (req.user?.companyId) return req.user.companyId
  const { q } = scopedQuery(null)
  const [fromAssignment] = await q<{ c: string }>(
    `
    SELECT COALESCE(ul.companyId, p.companyId) AS c FROM user_locations ul
    LEFT JOIN properties p ON p.id = ul.locId
    WHERE ul.userId = :userId AND ul.isDeleted = 0 AND COALESCE(ul.companyId, p.companyId) IS NOT NULL
    LIMIT 1`,
    { userId: req.user?.id ?? null },
  )
  if (fromAssignment?.c) return fromAssignment.c
  const locationId = (req.params.locationId as string | undefined) || req.locationId
  if (!locationId || locationId === 'ALL') return null
  const [fromProperty] = await q<{ c: string }>(`SELECT companyId AS c FROM properties WHERE id = :locationId`, {
    locationId,
  })
  return fromProperty?.c ?? null
}

async function toResponse(req: AuthenticatedRequest, setting: CompanyDashboardSetting | null) {
  let updatedByName: string | null = null
  if (setting?.updatedBy) {
    const { q } = scopedQuery(null)
    const [row] = await q<{ name: string | null }>(`SELECT ${userNameSql(':userId')} AS name`, {
      userId: setting.updatedBy,
    })
    updatedByName = row?.name ?? null
  }
  return {
    // Nothing saved yet: every tab is shown.
    visibleTabs: setting ? normaliseTabs(setting.visibleTabs ?? []) : [...DASHBOARD_TABS],
    allTabs: [...DASHBOARD_TABS],
    canEdit: canEdit(req),
    updatedAt: setting?.updatedAt ?? null,
    updatedByName,
  }
}

export async function getDashboardSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const companyId = await resolveCompanyId(req)
    const setting = companyId ? await CompanyDashboardSetting.findOne({ where: { companyId } }) : null
    res.status(200).json({ success: true, data: await toResponse(req, setting) })
  } catch (err: unknown) {
    console.error('Dashboard settings error:', err)
    const message = err instanceof Error ? err.message : 'Failed to fetch dashboard settings'
    res.status(500).json({ success: false, message })
  }
}

export async function updateDashboardSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canEdit(req)) {
      res.status(403).json({ success: false, message: 'Only a Super Admin or Admin can change the dashboard tabs.' })
      return
    }
    const companyId = await resolveCompanyId(req)
    if (!companyId) {
      res.status(400).json({ success: false, message: 'No company found for your account.' })
      return
    }
    const { visibleTabs } = req.body as UpdateDashboardSettingsInput
    const tabs = normaliseTabs(visibleTabs)
    const userId = req.user?.id ?? null

    const existing = await CompanyDashboardSetting.findOne({ where: { companyId } })
    const setting = existing
      ? await existing.update({ visibleTabs: tabs, updatedBy: userId })
      : await CompanyDashboardSetting.create({ companyId, visibleTabs: tabs, createdBy: userId, updatedBy: userId })

    res.status(200).json({
      success: true,
      message: 'Dashboard tabs updated for all properties',
      data: await toResponse(req, setting),
    })
  } catch (err: unknown) {
    console.error('Dashboard settings update error:', err)
    const message = err instanceof Error ? err.message : 'Failed to update dashboard settings'
    res.status(500).json({ success: false, message })
  }
}
