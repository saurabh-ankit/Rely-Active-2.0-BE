import type { Response } from 'express'
import {
  FnbDish,
  FnbGlobalPackage,
  FnbMenuItem,
  FnbPropertyDish,
  FnbPropertyPackage,
  FnbResidentOrder,
  FnbResidentPackage,
  Resident,
} from '../../../models/index.js'
import { FnbMealSlot, FnbOrderStatus } from '../../../enums/fnb.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'

export async function getResidentDailyMenu(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locId = (req.query.locationId as string) || req.user?.defaultLocationId
    if (!locId) {
      res.status(400).json({ success: false, message: 'locationId is required' })
      return
    }

    const todayStr = (req.query.date as string) || new Date().toISOString().split('T')[0]

    // Fetch menu items for this location
    const menuItems = await FnbMenuItem.findAll({
      where: { locId },
      include: [
        {
          model: FnbPropertyDish,
          as: 'propertyDish',
          include: [{ model: FnbDish, as: 'dish' }],
        },
      ],
    })

    const groupedSlots: Record<string, unknown[]> = {
      BREAKFAST: [],
      LUNCH: [],
      SNACKS: [],
      DINNER: [],
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    menuItems.forEach((item: any) => {
      const slotKey = String(item.mealSlot || '').toUpperCase()
      if (groupedSlots[slotKey]) {
        groupedSlots[slotKey].push({
          id: item.id,
          dishId: item.propertyDish?.dish?.id || null,
          name: item.propertyDish?.dish?.name || 'Dish Item',
          description: item.propertyDish?.dish?.description || '',
          dietaryType: item.propertyDish?.dish?.dietaryType || 'Veg',
          calories: item.propertyDish?.dish?.calories || 250,
          imageUrl: item.propertyDish?.dish?.imageUrl || null,
        })
      }
    })

    res.status(200).json({
      success: true,
      data: {
        date: todayStr,
        locationId: locId,
        menu: groupedSlots,
      },
    })
  } catch (err) {
    console.error('Error fetching resident daily menu:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch daily menu' })
  }
}

export async function placeMealOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { menuItemId, dishId, mealSlot, date } = req.body
    if (!menuItemId || !dishId || !mealSlot || !date) {
      res.status(400).json({ success: false, message: 'menuItemId, dishId, mealSlot, and date are required' })
      return
    }

    const resident = await Resident.findByPk(req.user?.id)
    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident account not found' })
      return
    }

    // Check if resident has active F&B package
    const activePkg = await FnbResidentPackage.findOne({
      where: {
        residentId: resident.id,
        status: 'active',
      },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
      ],
    })

    const order = await FnbResidentOrder.create({
      locId: resident.locId,
      residentId: resident.id,
      residentPackageId: activePkg?.id || null,
      menuItemId,
      dishId,
      date,
      mealSlot: (mealSlot as string).toLowerCase() as FnbMealSlot,
      quantity: 1,
      unitPrice: 0,
      totalAmount: 0,
      isPackageCovered: Boolean(activePkg),
      orderStatus: FnbOrderStatus.PLACED,
    })

    res.status(201).json({
      success: true,
      message: 'Meal order placed successfully',
      data: order,
    })
  } catch (err) {
    console.error('Error placing meal order:', err)
    res.status(500).json({ success: false, message: 'Failed to place meal order' })
  }
}

export async function getResidentOrdersHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const orders = await FnbResidentOrder.findAll({
      where: { residentId: req.user?.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    })

    res.status(200).json({
      success: true,
      data: orders,
    })
  } catch (err) {
    console.error('Error fetching resident orders history:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch order history' })
  }
}
