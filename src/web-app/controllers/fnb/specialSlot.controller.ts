import type { Request, Response } from 'express'
import {
  FnbGlobalSpecialSlot,
  FnbPropertySpecialSlot,
  FnbPropertySpecialSlotDish,
  FnbDish,
  Property,
} from '../../../models/index.js'

// ── Global Special Slots ───────────────────────────────────────────────────

export async function getGlobalSpecialSlots(_req: Request, res: Response): Promise<void> {
  try {
    const slots = await FnbGlobalSpecialSlot.findAll({
      include: [
        {
          model: FnbPropertySpecialSlot,
          as: 'propertySpecialSlots',
          include: [{ model: Property, as: 'property', attributes: ['id', 'property_name'] }],
        },
      ],
      order: [['createdAt', 'ASC']],
    })

    const formatted = slots.map((s) => {
      const plain = s.get({ plain: true }) as Record<string, unknown> & {
        price?: number
        propertySpecialSlots?: unknown[]
      }
      return {
        ...plain,
        price: Number(plain.price || 0),
        assignedPropertyCount: plain.propertySpecialSlots?.length || 0,
      }
    })

    res.status(200).json({ success: true, data: formatted })
  } catch (error) {
    console.error('Error fetching global special slots:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch global special slots' })
  }
}

export async function createGlobalSpecialSlot(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, price, assignedLocationIds } = req.body

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ success: false, message: 'Name is required' })
      return
    }

    const createdBy = (req as Request & { user?: { id?: string } }).user?.id || null
    const slotPrice = price !== undefined ? Number(price) : 0

    const globalSlot = await FnbGlobalSpecialSlot.create({
      name: name.trim(),
      description: description || null,
      price: slotPrice,
      createdBy,
    })

    // Assign to properties if assignedLocationIds is provided
    if (Array.isArray(assignedLocationIds) && assignedLocationIds.length > 0) {
      for (const locId of assignedLocationIds) {
        await FnbPropertySpecialSlot.create({
          globalSpecialSlotId: globalSlot.id,
          locId: String(locId),
          name: globalSlot.name,
          description: globalSlot.description,
          price: globalSlot.price,
          createdBy,
        })
      }
    }

    res.status(201).json({ success: true, data: globalSlot })
  } catch (error) {
    console.error('Error creating global special slot:', error)
    res.status(500).json({ success: false, message: 'Failed to create global special slot' })
  }
}

export async function updateGlobalSpecialSlot(req: Request, res: Response): Promise<void> {
  try {
    const slotId = String(req.params.id)
    const { name, description, price, isActive } = req.body

    const slot = await FnbGlobalSpecialSlot.findByPk(slotId)
    if (!slot) {
      res.status(404).json({ success: false, message: 'Global special slot not found' })
      return
    }

    if (name && typeof name === 'string' && name.trim()) {
      slot.name = name.trim()
    }
    if (description !== undefined) {
      slot.description = description
    }
    if (price !== undefined) {
      slot.price = Number(price)
    }
    if (isActive !== undefined) {
      slot.isActive = Boolean(isActive)
    }

    slot.updatedBy = (req as Request & { user?: { id?: string } }).user?.id || null
    await slot.save()

    // Sync display name, description & base price to property special slots that haven't been customized
    await FnbPropertySpecialSlot.update(
      { name: slot.name, description: slot.description, price: slot.price },
      { where: { globalSpecialSlotId: slot.id } },
    )

    res.status(200).json({ success: true, data: slot })
  } catch (error) {
    console.error('Error updating global special slot:', error)
    res.status(500).json({ success: false, message: 'Failed to update global special slot' })
  }
}

export async function deleteGlobalSpecialSlot(req: Request, res: Response): Promise<void> {
  try {
    const slotId = String(req.params.id)
    const slot = await FnbGlobalSpecialSlot.findByPk(slotId)
    if (!slot) {
      res.status(404).json({ success: false, message: 'Global special slot not found' })
      return
    }

    await slot.destroy()
    res.status(200).json({ success: true, message: 'Global special slot deleted successfully' })
  } catch (error) {
    console.error('Error deleting global special slot:', error)
    res.status(500).json({ success: false, message: 'Failed to delete global special slot' })
  }
}

export async function assignGlobalSpecialSlotLocations(req: Request, res: Response): Promise<void> {
  try {
    const slotId = String(req.params.id)
    const { locationIds } = req.body

    const globalSlot = await FnbGlobalSpecialSlot.findByPk(slotId)
    if (!globalSlot) {
      res.status(404).json({ success: false, message: 'Global special slot not found' })
      return
    }

    const createdBy = (req as Request & { user?: { id?: string } }).user?.id || null
    const targetLocIds: string[] = Array.isArray(locationIds) ? locationIds.map(String) : []

    // Existing property special slots for this global special slot
    const existing = await FnbPropertySpecialSlot.findAll({
      where: { globalSpecialSlotId: slotId },
    })
    const existingLocIds = existing.map((e) => e.locId)

    // Remove unselected locations
    for (const item of existing) {
      if (!targetLocIds.includes(item.locId)) {
        await item.destroy()
      }
    }

    // Add new locations
    for (const locId of targetLocIds) {
      if (!existingLocIds.includes(locId)) {
        await FnbPropertySpecialSlot.create({
          globalSpecialSlotId: globalSlot.id,
          locId,
          name: globalSlot.name,
          description: globalSlot.description,
          price: globalSlot.price,
          createdBy,
        })
      }
    }

    res.status(200).json({ success: true, message: 'Locations updated successfully' })
  } catch (error) {
    console.error('Error updating special slot locations:', error)
    res.status(500).json({ success: false, message: 'Failed to update special slot locations' })
  }
}

// ── Property Location Special Slots & Dishes ─────────────────────────────

export async function getPropertySpecialSlots(req: Request, res: Response): Promise<void> {
  try {
    const { locId } = req.query
    if (!locId) {
      res.status(400).json({ success: false, message: 'locId is required' })
      return
    }

    const slots = await FnbPropertySpecialSlot.findAll({
      where: { locId: String(locId) },
      include: [
        {
          model: FnbPropertySpecialSlotDish,
          as: 'specialDishes',
          include: [{ model: FnbDish, as: 'dish' }],
        },
      ],
      order: [['createdAt', 'ASC']],
    })

    const formatted = slots.map((s) => {
      const plain = s.get({ plain: true }) as Record<string, unknown> & {
        price?: number
      }
      return {
        ...plain,
        price: Number(plain.price || 0),
      }
    })

    res.status(200).json({ success: true, data: formatted })
  } catch (error) {
    console.error('Error fetching property special slots:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch property special slots' })
  }
}

export async function updatePropertySpecialSlot(req: Request, res: Response): Promise<void> {
  try {
    const slotId = String(req.params.id)
    const { price, isActive } = req.body

    const slot = await FnbPropertySpecialSlot.findByPk(slotId)
    if (!slot) {
      res.status(404).json({ success: false, message: 'Property special slot not found' })
      return
    }

    if (price !== undefined) {
      slot.price = Number(price)
    }
    if (isActive !== undefined) {
      slot.isActive = Boolean(isActive)
    }

    slot.updatedBy = (req as Request & { user?: { id?: string } }).user?.id || null
    await slot.save()

    res.status(200).json({ success: true, data: slot })
  } catch (error) {
    console.error('Error updating property special slot:', error)
    res.status(500).json({ success: false, message: 'Failed to update property special slot' })
  }
}

export async function addPropertySpecialDish(req: Request, res: Response): Promise<void> {
  try {
    const propertySpecialSlotId = String(req.params.propertySpecialSlotId)
    const { dishId, price, locId } = req.body

    if (!dishId || !locId) {
      res.status(400).json({ success: false, message: 'dishId and locId are required' })
      return
    }

    const slot = await FnbPropertySpecialSlot.findByPk(propertySpecialSlotId)
    if (!slot) {
      res.status(404).json({ success: false, message: 'Property special slot not found' })
      return
    }

    const createdBy = (req as Request & { user?: { id?: string } }).user?.id || null

    const item = await FnbPropertySpecialSlotDish.create({
      propertySpecialSlotId,
      locId: String(locId),
      dishId: String(dishId),
      price: price !== undefined ? Number(price) : 0,
      createdBy,
    })

    const result = await FnbPropertySpecialSlotDish.findByPk(item.id, {
      include: [{ model: FnbDish, as: 'dish' }],
    })

    res.status(201).json({ success: true, data: result })
  } catch (error) {
    console.error('Error adding special dish:', error)
    res.status(500).json({ success: false, message: 'Failed to add special dish' })
  }
}

export async function removePropertySpecialDish(req: Request, res: Response): Promise<void> {
  try {
    const dishRecordId = String(req.params.id)
    const item = await FnbPropertySpecialSlotDish.findByPk(dishRecordId)
    if (!item) {
      res.status(404).json({ success: false, message: 'Special dish not found' })
      return
    }

    await item.destroy()
    res.status(200).json({ success: true, message: 'Special dish removed successfully' })
  } catch (error) {
    console.error('Error removing special dish:', error)
    res.status(500).json({ success: false, message: 'Failed to remove special dish' })
  }
}

export async function syncPropertySpecialSlotDishes(req: Request, res: Response): Promise<void> {
  try {
    const { propertySpecialSlotId, dishes, locId } = req.body

    if (!propertySpecialSlotId || !locId) {
      res.status(400).json({ success: false, message: 'propertySpecialSlotId and locId are required' })
      return
    }

    const createdBy = (req as Request & { user?: { id?: string } }).user?.id || null

    await FnbPropertySpecialSlotDish.destroy({
      where: { propertySpecialSlotId },
    })

    if (Array.isArray(dishes) && dishes.length > 0) {
      for (const d of dishes) {
        await FnbPropertySpecialSlotDish.create({
          propertySpecialSlotId,
          locId: String(locId),
          dishId: String(d.dishId),
          price: d.price !== undefined ? Number(d.price) : 0,
          createdBy,
        })
      }
    }

    res.status(200).json({ success: true, message: 'Special slot dishes synced successfully' })
  } catch (error) {
    console.error('Error syncing special slot dishes:', error)
    res.status(500).json({ success: false, message: 'Failed to sync special slot dishes' })
  }
}
