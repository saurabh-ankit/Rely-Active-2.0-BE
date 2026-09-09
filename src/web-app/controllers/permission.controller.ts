import type { Request, Response } from 'express'
import { Resource } from '../../models/index.js'

const SIDEBAR_RESOURCE_ORDER: Record<string, number> = {
  RESIDENT: 1,
  EMPLOYEE: 2,
  ROSTER: 3,
  TICKETS: 4,
  GNS: 5,
  INVENTORY: 6,
  ASSET: 7,
  MEDICAL: 8,
  FNB: 9,
  BILLING: 10,
  EVENTS: 11,
}

const sortResourcesBySidebarOrder = (resources: Resource[]) => {
  return [...resources].sort((a, b) => {
    const orderA = SIDEBAR_RESOURCE_ORDER[a.key] ?? 999
    const orderB = SIDEBAR_RESOURCE_ORDER[b.key] ?? 999
    if (orderA !== orderB) return orderA - orderB
    return a.name.localeCompare(b.name)
  })
}

export async function getAllPermissions(_req: Request, res: Response): Promise<void> {
  try {
    const resources = await Resource.findAll({
      where: { isActive: true },
    })

    const sorted = sortResourcesBySidebarOrder(resources)

    res.status(200).json({
      success: true,
      data: {
        permissions: sorted,
        modules: sorted,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function getModules(_req: Request, res: Response): Promise<void> {
  try {
    const resources = await Resource.findAll({
      where: { isActive: true },
    })

    const sorted = sortResourcesBySidebarOrder(resources)

    res.status(200).json({
      success: true,
      data: sorted,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
