import { z } from 'zod'

/** Every dashboard tab, in display order. `dashboard` is always shown. */
export const DASHBOARD_TABS = [
  'dashboard',
  'occupancy',
  'billing',
  'inventory',
  'tickets',
  'visitors',
  'dining',
  'events',
  'medical',
  'staff',
  'assets',
  'feedback',
] as const

export type DashboardTab = (typeof DASHBOARD_TABS)[number]

/** Tabs whose data comes from `GET /dashboard/analytics/:tab` (the rest come from `/dashboard/stats`). */
export const ANALYTICS_TABS = [
  'tickets',
  'visitors',
  'dining',
  'events',
  'medical',
  'staff',
  'assets',
  'feedback',
] as const

export type AnalyticsTab = (typeof ANALYTICS_TABS)[number]

export const updateDashboardSettingsSchema = z.object({
  visibleTabs: z.array(z.enum(DASHBOARD_TABS)).max(DASHBOARD_TABS.length),
})

export type UpdateDashboardSettingsInput = z.infer<typeof updateDashboardSettingsSchema>
