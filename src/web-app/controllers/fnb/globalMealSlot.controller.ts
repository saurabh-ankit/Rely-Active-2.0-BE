import type { Request, Response } from 'express'
import { FnbGlobalMealSlot, FnbPropertyMealSlot, Property } from '../../../models/index.js'

export async function getGlobalMealSlots(req: Request, res: Response): Promise<void> {
  try {
    const slots = await FnbGlobalMealSlot.findAll({
      include: [{ model: FnbPropertyMealSlot, as: 'propertyMealSlots' }],
    })

    const formatted = slots
      .map((s) => {
        const plain = s.get({ plain: true }) as Record<string, unknown> & {
          startTime?: string
          price?: number
          propertyMealSlots?: unknown[]
        }
        return {
          ...plain,
          price: Number(plain.price || 0),
          assignedPropertyCount: plain.propertyMealSlots?.length || 0,
        }
      })
      .sort((a, b) => parseTimeToMinutes(a.startTime || '') - parseTimeToMinutes(b.startTime || ''))

    res.status(200).json({
      success: true,
      data: formatted,
    })
  } catch (error) {
    console.error('Error fetching global meal slots:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch global meal slots' })
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

export async function createGlobalMealSlot(req: Request, res: Response): Promise<void> {
  try {
    const { name, startTime, endTime, price, description, assignToAllProperties, assignedPropertyIds } = req.body

    if (!name || !(name as string).trim()) {
      res.status(400).json({ success: false, message: 'Name is required' })
      return
    }

    const startStr = startTime || '07:30'
    const endStr = endTime || '10:00'

    const sMin = parseTimeToMinutes(startStr)
    let eMin = parseTimeToMinutes(endStr)
    if (eMin <= sMin) eMin += 1440
    if (sMin >= eMin) {
      res.status(400).json({ success: false, message: 'Start time must be before end time.' })
      return
    }

    const cleanName = (name as string).trim()
    const existing = await FnbGlobalMealSlot.findOne({ where: { name: cleanName } })
    if (existing) {
      res.status(400).json({ success: false, message: `Global meal slot "${cleanName}" already exists` })
      return
    }

    // Check collision with existing active global meal slots
    const activeGlobalSlots = await FnbGlobalMealSlot.findAll({ where: { isActive: true } })
    for (const gSlot of activeGlobalSlots) {
      if (isTimeOverlapping(startStr, endStr, gSlot.startTime, gSlot.endTime)) {
        res.status(400).json({
          success: false,
          message: `Meal slot timing (${startStr} - ${endStr}) collides with existing global slot "${gSlot.name}" (${gSlot.startTime} - ${gSlot.endTime}).`,
        })
        return
      }
    }

    const slot = await FnbGlobalMealSlot.create({
      name: cleanName,
      startTime: startStr,
      endTime: endStr,
      price: price !== undefined ? Number(price) : 0,
      description: description || null,
      isActive: true,
      createdBy: (req as Request & { user?: { id?: string } }).user?.id || null,
    })

    // Assign to properties
    let targetPropertyIds: string[] = []
    if (Array.isArray(assignedPropertyIds)) {
      targetPropertyIds = assignedPropertyIds
    } else if (assignToAllProperties) {
      const properties = await Property.findAll({ attributes: ['id'] })
      targetPropertyIds = properties.map((p) => p.id)
    }

    for (const locId of targetPropertyIds) {
      await FnbPropertyMealSlot.create({
        locId,
        globalMealSlotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        price: slot.price,
        isActive: true,
        createdBy: (req as Request & { user?: { id?: string } }).user?.id || null,
      })
    }

    res.status(201).json({
      success: true,
      message: 'Global meal slot created successfully',
      data: {
        ...slot.get({ plain: true }),
        price: Number(slot.price || 0),
      },
    })
  } catch (error) {
    console.error('Error creating global meal slot:', error)
    res.status(500).json({ success: false, message: 'Failed to create global meal slot' })
  }
}

export async function updateGlobalMealSlot(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { name, startTime, endTime, price, description, isActive, assignedPropertyIds } = req.body

    const slot = await FnbGlobalMealSlot.findByPk(id)
    if (!slot) {
      res.status(404).json({ success: false, message: 'Global meal slot not found' })
      return
    }

    const targetStartTime = startTime !== undefined ? startTime : slot.startTime
    const targetEndTime = endTime !== undefined ? endTime : slot.endTime
    const targetIsActive = isActive !== undefined ? Boolean(isActive) : slot.isActive

    if (targetIsActive) {
      const sMin = parseTimeToMinutes(targetStartTime)
      let eMin = parseTimeToMinutes(targetEndTime)
      if (eMin <= sMin) eMin += 1440
      if (sMin >= eMin) {
        res.status(400).json({ success: false, message: 'Start time must be before end time.' })
        return
      }

      const activeGlobalSlots = await FnbGlobalMealSlot.findAll({ where: { isActive: true } })
      for (const gSlot of activeGlobalSlots) {
        if (gSlot.id === id) continue
        if (isTimeOverlapping(targetStartTime, targetEndTime, gSlot.startTime, gSlot.endTime)) {
          res.status(400).json({
            success: false,
            message: `Meal slot timing (${targetStartTime} - ${targetEndTime}) collides with existing global slot "${gSlot.name}" (${gSlot.startTime} - ${gSlot.endTime}).`,
          })
          return
        }
      }
    }

    if (name !== undefined) slot.name = (name as string).trim()
    if (startTime !== undefined) slot.startTime = startTime
    if (endTime !== undefined) slot.endTime = endTime
    if (price !== undefined) slot.price = Number(price)
    if (description !== undefined) slot.description = description
    if (isActive !== undefined) slot.isActive = Boolean(isActive)
    slot.updatedBy = (req as Request & { user?: { id?: string } }).user?.id || null

    await slot.save()

    if (Array.isArray(assignedPropertyIds)) {
      const existingPropSlots = await FnbPropertyMealSlot.findAll({ where: { globalMealSlotId: id } })
      const existingLocIds = existingPropSlots.map((ps) => ps.locId)

      for (const ps of existingPropSlots) {
        if (!assignedPropertyIds.includes(ps.locId)) {
          await ps.destroy()
        }
      }

      for (const locId of assignedPropertyIds) {
        if (!existingLocIds.includes(locId)) {
          await FnbPropertyMealSlot.create({
            locId,
            globalMealSlotId: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            price: slot.price,
            isActive: true,
            createdBy: (req as Request & { user?: { id?: string } }).user?.id || null,
          })
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Global meal slot updated successfully',
      data: {
        ...slot.get({ plain: true }),
        price: Number(slot.price || 0),
      },
    })
  } catch (error) {
    console.error('Error updating global meal slot:', error)
    res.status(500).json({ success: false, message: 'Failed to update global meal slot' })
  }
}

export async function deleteGlobalMealSlot(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const slot = await FnbGlobalMealSlot.findByPk(id)
    if (!slot) {
      res.status(404).json({ success: false, message: 'Global meal slot not found' })
      return
    }

    await FnbPropertyMealSlot.destroy({ where: { globalMealSlotId: id } })
    await slot.destroy()

    res.status(200).json({
      success: true,
      message: 'Global meal slot deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting global meal slot:', error)
    res.status(500).json({ success: false, message: 'Failed to delete global meal slot' })
  }
}

export async function assignMealSlotsToProperty(req: Request, res: Response): Promise<void> {
  try {
    const { locId, globalMealSlotIds } = req.body

    if (!locId || !Array.isArray(globalMealSlotIds)) {
      res.status(400).json({ success: false, message: 'locId and globalMealSlotIds array are required' })
      return
    }

    for (const slotId of globalMealSlotIds) {
      const globalSlot = await FnbGlobalMealSlot.findByPk(slotId)
      if (!globalSlot) continue

      const [pSlot, created] = await FnbPropertyMealSlot.findOrCreate({
        where: { locId, globalMealSlotId: slotId },
        defaults: {
          locId,
          globalMealSlotId: slotId,
          startTime: globalSlot.startTime,
          endTime: globalSlot.endTime,
          price: globalSlot.price,
          isActive: true,
          createdBy: (req as Request & { user?: { id?: string } }).user?.id || null,
        },
      })

      if (!created) {
        pSlot.isActive = true
        await pSlot.save()
      }
    }

    res.status(200).json({
      success: true,
      message: 'Meal slots assigned to property successfully',
    })
  } catch (error) {
    console.error('Error assigning meal slots to property:', error)
    res.status(500).json({ success: false, message: 'Failed to assign meal slots' })
  }
}
