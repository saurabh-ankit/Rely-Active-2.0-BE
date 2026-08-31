import type { Request, Response } from 'express'
import { FnbDish, FnbMenu, FnbMenuItem } from '../../../models/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { FnbMealSlot, FnbMenuStatus } from '../../../enums/fnb.enum.js'

export async function getMenus(req: Request, res: Response): Promise<void> {
  try {
    const { locId } = req.query
    if (!locId) {
      res.status(400).json({ success: false, message: 'Location ID is required' })
      return
    }

    const [menu] = await FnbMenu.findOrCreate({
      where: { locId: locId as string },
      defaults: {
        locId: locId as string,
        title: 'Location Food Menu',
        status: FnbMenuStatus.DRAFT,
      },
    })

    const fullMenu = await FnbMenu.findByPk(menu.id, {
      include: [
        {
          model: FnbMenuItem,
          as: 'menuItems',
          include: [{ model: FnbDish, as: 'dish' }],
        },
      ],
    })

    res.status(200).json({
      success: true,
      data: fullMenu ? [fullMenu] : [],
    })
  } catch (error) {
    console.error('Error fetching menus:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch menus' })
  }
}

export async function getMenuDetails(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const menu = await FnbMenu.findByPk(id, {
      include: [
        {
          model: FnbMenuItem,
          as: 'menuItems',
          include: [{ model: FnbDish, as: 'dish' }],
        },
      ],
    })

    if (!menu) {
      res.status(404).json({ success: false, message: 'Menu not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: menu,
    })
  } catch (error) {
    console.error('Error fetching menu details:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch menu details' })
  }
}

export async function createMenuSchedule(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { locId, title, status, items } = req.body

    const [menu] = await FnbMenu.findOrCreate({
      where: { locId },
      defaults: {
        locId,
        title: title || 'Location Food Menu',
        status: status || FnbMenuStatus.PUBLISHED,
        createdBy: req.user?.id || null,
      },
    })

    if (status) {
      await menu.update({ status, updatedBy: req.user?.id || null })
    }

    if (Array.isArray(items)) {
      // Replace existing menu items with published items
      await FnbMenuItem.destroy({ where: { menuId: menu.id } })

      const menuItemsPayload = items.map(
        (item: {
          dayOfWeek?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | null
          date?: string | null
          isOverride?: boolean
          mealSlot: FnbMealSlot
          dishId: string
          isOptional?: boolean
          extraPrice?: number
          notes?: string
        }) => ({
          menuId: menu.id,
          locId,
          dayOfWeek: item.dayOfWeek || null,
          date: item.date || null,
          isOverride: item.isOverride || false,
          mealSlot: item.mealSlot,
          dishId: item.dishId,
          isOptional: item.isOptional || false,
          extraPrice: item.extraPrice || 0,
          notes: item.notes || null,
          createdBy: req.user?.id || null,
        }),
      )

      await FnbMenuItem.bulkCreate(menuItemsPayload)
    }

    const result = await FnbMenu.findByPk(menu.id, {
      include: [
        {
          model: FnbMenuItem,
          as: 'menuItems',
          include: [{ model: FnbDish, as: 'dish' }],
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Menu schedule saved successfully',
      data: result,
    })
  } catch (error) {
    console.error('Error creating/updating menu schedule:', error)
    res.status(500).json({ success: false, message: 'Failed to save menu schedule' })
  }
}

export async function addOrUpdateMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { menuId, locId, dayOfWeek, date, isOverride, mealSlot, dishId, isOptional, extraPrice, notes } = req.body

    let targetMenuId = menuId
    if (!targetMenuId) {
      const [menu] = await FnbMenu.findOrCreate({
        where: { locId },
        defaults: {
          locId,
          title: 'Location Food Menu',
          status: FnbMenuStatus.DRAFT,
          createdBy: req.user?.id || null,
        },
      })
      targetMenuId = menu.id
    }

    // Check if dish already exists in this meal slot for target day/date
    const whereClause: Record<string, unknown> = {
      menuId: targetMenuId,
      locId,
      mealSlot,
      dishId,
    }
    if (date) {
      whereClause.date = date
    } else if (dayOfWeek) {
      whereClause.dayOfWeek = dayOfWeek
      whereClause.date = null
    }

    const existing = await FnbMenuItem.findOne({
      where: whereClause,
      include: [{ model: FnbDish, as: 'dish' }],
    })

    if (existing) {
      res.status(200).json({
        success: true,
        message: 'Dish is already added to this meal slot',
        data: existing,
      })
      return
    }

    const item = await FnbMenuItem.create({
      menuId: targetMenuId,
      locId,
      dayOfWeek: dayOfWeek || null,
      date: date || null,
      isOverride: isOverride || false,
      mealSlot,
      dishId,
      isOptional: isOptional || false,
      extraPrice: extraPrice || 0,
      notes: notes || null,
      createdBy: req.user?.id || null,
    })

    // Revert menu status to DRAFT so changes must be reviewed and published
    await FnbMenu.update({ status: FnbMenuStatus.DRAFT }, { where: { id: targetMenuId } })

    const result = await FnbMenuItem.findByPk(item.id, {
      include: [{ model: FnbDish, as: 'dish' }],
    })

    res.status(201).json({
      success: true,
      message: 'Menu item added successfully',
      data: result,
    })
  } catch (error) {
    console.error('Error adding menu item:', error)
    res.status(500).json({ success: false, message: 'Failed to add menu item' })
  }
}

export async function deleteMenuItem(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const item = await FnbMenuItem.findByPk(id)
    if (!item) {
      res.status(404).json({ success: false, message: 'Menu item not found' })
      return
    }

    if (item.menuId) {
      // Revert menu status to DRAFT so changes must be reviewed and published
      await FnbMenu.update({ status: FnbMenuStatus.DRAFT }, { where: { id: item.menuId } })
    }

    await item.destroy()
    res.status(200).json({ success: true, message: 'Menu item removed successfully' })
  } catch (error) {
    console.error('Error removing menu item:', error)
    res.status(500).json({ success: false, message: 'Failed to remove menu item' })
  }
}

export async function deleteMenu(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const menu = await FnbMenu.findByPk(id)
    if (!menu) {
      res.status(404).json({ success: false, message: 'Menu not found' })
      return
    }

    await menu.destroy()
    res.status(200).json({ success: true, message: 'Menu deleted successfully' })
  } catch (error) {
    console.error('Error deleting menu:', error)
    res.status(500).json({ success: false, message: 'Failed to delete menu' })
  }
}

export async function updateMenuSchedule(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { title, status } = req.body

    const menu = await FnbMenu.findByPk(id)
    if (!menu) {
      res.status(404).json({ success: false, message: 'Menu schedule not found' })
      return
    }

    await menu.update({
      title: title || menu.title,
      status: status || menu.status,
      updatedBy: req.user?.id || null,
    })

    const updatedMenu = await FnbMenu.findByPk(id, {
      include: [
        {
          model: FnbMenuItem,
          as: 'menuItems',
          include: [{ model: FnbDish, as: 'dish' }],
        },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Menu schedule updated successfully',
      data: updatedMenu,
    })
  } catch (error) {
    console.error('Error updating menu schedule:', error)
    res.status(500).json({ success: false, message: 'Failed to update menu schedule' })
  }
}
