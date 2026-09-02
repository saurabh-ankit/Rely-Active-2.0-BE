import type { Request, Response } from 'express'
import { FnbGlobalMealSlot, FnbPropertyMealSlot } from '../../../models/index.js'

export async function getPropertyMealSlots(req: Request, res: Response): Promise<void> {
  try {
    const locId =
      (req.query.locId as string) ||
      (req.headers['x-location-id'] as string) ||
      (req.headers['x-property-id'] as string)

    if (!locId) {
      res.status(400).json({ success: false, message: 'locId is required' })
      return
    }

    const pSlots = await FnbPropertyMealSlot.findAll({
      where: { locId },
      include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
    })

    const formatted = pSlots
      .map((ps) => {
        const plain = ps.get({ plain: true }) as Record<string, unknown> & {
          globalMealSlot?: Record<string, unknown>
        }
        const g = plain.globalMealSlot
        return {
          id: plain.id as string,
          locId: plain.locId as string,
          globalMealSlotId: plain.globalMealSlotId as string,
          name: (g?.name as string) || 'Meal Slot',
          code: (g?.code as string) || 'SLOT',
          description: (g?.description as string) || null,
          startTime: (plain.startTime as string) || (g?.startTime as string) || '07:30',
          endTime: (plain.endTime as string) || (g?.endTime as string) || '10:00',
          price: plain.price !== null && plain.price !== undefined ? Number(plain.price) : Number(g?.price || 0),
          globalStartTime: (g?.startTime as string) || '07:30',
          globalEndTime: (g?.endTime as string) || '10:00',
          globalPrice: Number(g?.price || 0),
          isActive: plain.isActive as boolean,
        }
      })
      .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime))

    res.status(200).json({
      success: true,
      data: formatted,
    })
  } catch (error) {
    console.error('Error fetching property meal slots:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch property meal slots' })
  }
}

function parseTimeToMinutes(tStr: string): number {
  if (!tStr) return 0
  const parts = tStr.split(':').map((p) => parseInt(p, 10) || 0)
  const hours = parts[0] || 0
  const minutes = parts[1] || 0
  return hours * 60 + minutes
}

interface TimeInterval {
  start: number
  end: number
}

function getSlotIntervals(startStr: string, endStr: string): TimeInterval[] {
  const s = parseTimeToMinutes(startStr)
  const e = parseTimeToMinutes(endStr)

  if (s === e) {
    return [{ start: 0, end: 1440 }]
  }

  if (s < e) {
    return [{ start: s, end: e }]
  } else {
    return [
      { start: s, end: 1440 },
      { start: 0, end: e },
    ]
  }
}

function isTimeOverlapping(start1Str: string, end1Str: string, start2Str: string, end2Str: string): boolean {
  const intervals1 = getSlotIntervals(start1Str, end1Str)
  const intervals2 = getSlotIntervals(start2Str, end2Str)

  for (const i1 of intervals1) {
    for (const i2 of intervals2) {
      if (i1.start < i2.end && i1.end > i2.start) {
        return true
      }
    }
  }
  return false
}

export async function updatePropertyMealSlotOverride(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { startTime, endTime, price, isActive } = req.body

    const pSlot = await FnbPropertyMealSlot.findByPk(id, {
      include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
    })
    if (!pSlot) {
      res.status(404).json({ success: false, message: 'Property meal slot override not found' })
      return
    }

    const targetStartTime = startTime !== undefined ? startTime : pSlot.startTime
    const targetEndTime = endTime !== undefined ? endTime : pSlot.endTime
    const targetIsActive = isActive !== undefined ? Boolean(isActive) : pSlot.isActive

    if (targetIsActive) {
      const sMin = parseTimeToMinutes(targetStartTime)
      let eMin = parseTimeToMinutes(targetEndTime)
      if (eMin <= sMin) eMin += 1440
      if (sMin >= eMin) {
        res.status(400).json({ success: false, message: 'Start time must be before end time.' })
        return
      }

      // Check collision with other active property meal slots for this locId
      const otherPropSlots = await FnbPropertyMealSlot.findAll({
        where: { locId: pSlot.locId, isActive: true },
        include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
      })

      for (const other of otherPropSlots) {
        if (other.id === id) continue
        const gSlot = other.globalMealSlot as unknown as Record<string, string>
        const oStart = other.startTime || gSlot?.startTime || '07:30'
        const oEnd = other.endTime || gSlot?.endTime || '10:00'
        const slotName = gSlot?.name || 'Meal Slot'

        if (isTimeOverlapping(targetStartTime, targetEndTime, oStart, oEnd)) {
          res.status(400).json({
            success: false,
            message: `Meal slot timing (${targetStartTime} - ${targetEndTime}) collides with existing property slot "${slotName}" (${oStart} - ${oEnd}) in this property.`,
          })
          return
        }
      }
    }

    if (startTime !== undefined) pSlot.startTime = startTime
    if (endTime !== undefined) pSlot.endTime = endTime
    if (price !== undefined) pSlot.price = price !== null ? Number(price) : null
    if (isActive !== undefined) pSlot.isActive = Boolean(isActive)
    pSlot.updatedBy = (req as Request & { user?: { id?: string } }).user?.id || null

    await pSlot.save()

    const plain = pSlot.get({ plain: true }) as Record<string, unknown> & {
      globalMealSlot?: Record<string, unknown>
    }
    const g = plain.globalMealSlot

    res.status(200).json({
      success: true,
      message: 'Property meal slot updated successfully',
      data: {
        id: plain.id,
        locId: plain.locId,
        globalMealSlotId: plain.globalMealSlotId,
        name: g?.name || 'Meal Slot',
        code: g?.code || 'SLOT',
        startTime: plain.startTime || g?.startTime || '07:30',
        endTime: plain.endTime || g?.endTime || '10:00',
        price: plain.price !== null && plain.price !== undefined ? Number(plain.price) : Number(g?.price || 0),
        isActive: plain.isActive,
      },
    })
  } catch (error) {
    console.error('Error updating property meal slot override:', error)
    res.status(500).json({ success: false, message: 'Failed to update property meal slot' })
  }
}
