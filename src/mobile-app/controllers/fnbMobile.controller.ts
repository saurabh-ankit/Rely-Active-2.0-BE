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
} from '../../models/index.js'
import { FnbOrderStatus } from '../../enums/fnb.enum.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'

export async function getResidentDailyMenu(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = req.user?.id
    const targetDate = (req.query.date as string) || new Date().toISOString().split('T')[0]

    if (!residentId) {
      res.status(401).json({ success: false, message: 'Unauthorized access' })
      return
    }

    // 1. Fetch resident details
    const resident = await Resident.findByPk(residentId)
    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident account not found' })
      return
    }

    if (!resident.isResiding) {
      res.status(403).json({
        success: false,
        message: 'Menu ordering is only available for residing residents.',
      })
      return
    }

    const locId = resident.locId

    // 2. Fetch active food package subscription for resident
    const activeSubscription = await FnbResidentPackage.findOne({
      where: { residentId: resident.id, status: 'active' },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
      ],
    })

    const includedSlots: string[] =
      (activeSubscription?.propertyPackage?.globalPackage?.includedMealSlots as string[]) || []

    // 3. Find published menu items for targetDate
    const menuItems = await FnbMenuItem.findAll({
      where: { locId, date: targetDate },
      include: [{ model: FnbDish, as: 'dish' }],
    })

    // Also fetch property dish price overrides
    const propertyDishes = await FnbPropertyDish.findAll({ where: { locId } })
    const priceMap = new Map<string, number>()
    propertyDishes.forEach((pd: FnbPropertyDish) => {
      priceMap.set(pd.dishId, Number(pd.price))
    })

    // 4. Map menu items with package coverage logic
    const categorizedMenu = {
      breakfast: [] as unknown[],
      lunch: [] as unknown[],
      snacks: [] as unknown[],
      dinner: [] as unknown[],
    }

    menuItems.forEach((item: FnbMenuItem) => {
      const dish = item.dish
      if (!dish) return

      const overridePrice = priceMap.get(dish.id)
      const standardPrice = overridePrice !== undefined ? overridePrice : Number(dish.basePrice)
      const extraPrice = Number(item.extraPrice) || 0
      const isSlotCovered = includedSlots.includes(item.mealSlot)
      const isCovered = Boolean(activeSubscription && isSlotCovered && !item.isOptional)

      const finalPrice = isCovered ? 0 : standardPrice + extraPrice

      const formattedItem = {
        menuItemId: item.id,
        dishId: dish.id,
        name: dish.name,
        category: dish.category,
        dietaryType: dish.dietaryType,
        description: dish.description,
        imageUrl: dish.imageUrl,
        nutritionalInfo: dish.nutritionalInfo,
        mealSlot: item.mealSlot,
        isOptional: item.isOptional,
        notes: item.notes,
        standardPrice,
        extraPrice,
        effectivePrice: finalPrice,
        isPackageCovered: isCovered,
      }

      if (item.mealSlot === 'breakfast') categorizedMenu.breakfast.push(formattedItem)
      else if (item.mealSlot === 'lunch') categorizedMenu.lunch.push(formattedItem)
      else if (item.mealSlot === 'snacks') categorizedMenu.snacks.push(formattedItem)
      else if (item.mealSlot === 'dinner') categorizedMenu.dinner.push(formattedItem)
    })

    res.status(200).json({
      success: true,
      data: {
        date: targetDate,
        resident: {
          id: resident.id,
          name: `${resident.firstName} ${resident.lastName || ''}`.trim(),
          isResiding: resident.isResiding,
        },
        packageSubscription: activeSubscription
          ? {
              packageName: activeSubscription.propertyPackage?.globalPackage?.name,
              includedSlots,
              price: activeSubscription.propertyPackage?.price || 0,
            }
          : null,
        menu: categorizedMenu,
      },
    })
  } catch (error) {
    console.error('Error fetching resident daily menu:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch daily menu' })
  }
}

export async function placeMealOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = req.user?.id
    const { menuItemId, dishId, date, mealSlot, quantity = 1 } = req.body

    if (!residentId) {
      res.status(401).json({ success: false, message: 'Unauthorized access' })
      return
    }

    const resident = await Resident.findByPk(residentId)
    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    if (!resident.isResiding) {
      res.status(403).json({ success: false, message: 'Meal ordering is restricted to residing residents.' })
      return
    }

    // 1. Verify menuItem
    const menuItem = await FnbMenuItem.findByPk(menuItemId, {
      include: [{ model: FnbDish, as: 'dish' }],
    })

    if (!menuItem) {
      res.status(404).json({ success: false, message: 'Menu item not found' })
      return
    }

    // 2. Check resident package
    const activeSubscription = await FnbResidentPackage.findOne({
      where: { residentId, status: 'active' },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
      ],
    })

    const includedSlots: string[] =
      (activeSubscription?.propertyPackage?.globalPackage?.includedMealSlots as string[]) || []
    const isSlotCovered = includedSlots.includes(mealSlot)
    const isCovered = Boolean(activeSubscription && isSlotCovered && !menuItem.isOptional)

    // Calculate price
    const propertyDish = await FnbPropertyDish.findOne({ where: { locId: resident.locId, dishId } })
    const baseDishPrice = propertyDish ? Number(propertyDish.price) : Number(menuItem.dish?.basePrice || 0)
    const unitPrice = isCovered ? 0 : baseDishPrice + Number(menuItem.extraPrice || 0)
    const totalAmount = unitPrice * quantity

    const order = await FnbResidentOrder.create({
      locId: resident.locId,
      residentId: resident.id,
      residentPackageId: activeSubscription?.id || null,
      menuItemId,
      dishId,
      date,
      mealSlot,
      quantity,
      unitPrice,
      totalAmount,
      isPackageCovered: isCovered,
      orderStatus: FnbOrderStatus.PLACED,
      createdBy: req.user?.id || null,
    })

    res.status(201).json({
      success: true,
      message: 'Meal order placed successfully',
      data: order,
    })
  } catch (error) {
    console.error('Error placing meal order:', error)
    res.status(500).json({ success: false, message: 'Failed to place meal order' })
  }
}

export async function getResidentOrdersHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = req.user?.id
    if (!residentId) {
      res.status(401).json({ success: false, message: 'Unauthorized access' })
      return
    }

    const orders = await FnbResidentOrder.findAll({
      where: { residentId },
      include: [{ model: FnbDish, as: 'dish' }],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    })

    res.status(200).json({
      success: true,
      data: orders,
    })
  } catch (error) {
    console.error('Error fetching resident orders history:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch order history' })
  }
}
