import type { Response } from 'express'
import { Op } from 'sequelize'
import {
  FnbDish,
  FnbGlobalMealSlot,
  FnbGlobalPackage,
  FnbMenuItem,
  FnbPropertyMealSlot,
  FnbPropertyPackage,
  FnbPropertySpecialSlot,
  FnbPropertySpecialSlotDish,
  FnbResidentOrder,
  FnbResidentOrderDetail,
  FnbResidentPackage,
  Resident,
  ResidentFamilyMember,
} from '../../../models/index.js'
import { FnbMealSlot, FnbOrderStatus } from '../../../enums/fnb.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'

export async function getResidentDailyMenu(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locId = (req.query.locationId as string) || (req.query.locId as string) || req.user?.defaultLocationId
    if (!locId) {
      res.status(400).json({ success: false, message: 'locationId is required' })
      return
    }

    const todayStr = (req.query.date as string) || new Date().toISOString().split('T')[0]
    const dateObj = new Date(todayStr + 'T00:00:00Z')
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const targetDayOfWeek = days[dateObj.getUTCDay()]

    // Fetch menu items filtered by location AND requested date/dayOfWeek schedule
    const menuItems = await FnbMenuItem.findAll({
      where: {
        locId,
        [Op.or]: [{ date: todayStr }, { dayOfWeek: targetDayOfWeek }, { dayOfWeek: targetDayOfWeek?.toUpperCase() }],
      },
      include: [
        {
          model: FnbDish,
          as: 'dish',
        },
      ],
    })

    const groupedSlots: Record<string, unknown[]> = {
      breakfast: [],
      lunch: [],
      snacks: [],
      dinner: [],
      mid_night_snacks: [],
      BREAKFAST: [],
      LUNCH: [],
      SNACKS: [],
      DINNER: [],
      MID_NIGHT_SNACKS: [],
    }

    menuItems.forEach((item) => {
      const plain = item.get({ plain: true }) as {
        id: string
        mealSlot?: string
        mealSlotId?: string
        dishId?: string
        dish?: {
          id?: string
          name?: string
          description?: string
          dietaryType?: string
          calories?: number
          imageUrl?: string
        }
      }
      const rawSlot = String(plain.mealSlot || '').trim()
      if (!rawSlot) return

      const dishObj = plain.dish
      const itemPrice =
        dishObj && (dishObj as unknown as { basePrice?: number }).basePrice !== undefined
          ? Number((dishObj as unknown as { basePrice?: number }).basePrice)
          : 0

      const formattedItem = {
        id: plain.id,
        dishId: dishObj?.id || plain.dishId || null,
        mealSlot: plain.mealSlot,
        mealSlotId: plain.mealSlotId,
        name: dishObj?.name || 'Dish Item',
        description: dishObj?.description || '',
        dietaryType: dishObj?.dietaryType || 'Veg',
        calories: dishObj?.calories || 250,
        imageUrl: dishObj?.imageUrl || null,
        price: itemPrice,
        basePrice: itemPrice,
        effectivePrice: itemPrice,
      }

      const keysToSet = new Set<string>()
      keysToSet.add(rawSlot)
      keysToSet.add(rawSlot.toLowerCase())
      keysToSet.add(rawSlot.toUpperCase())
      keysToSet.add(rawSlot.toLowerCase().replace(/[^a-z0-9]/g, '_'))
      keysToSet.add(rawSlot.toUpperCase().replace(/[^A-Z0-9]/g, '_'))
      keysToSet.add(rawSlot.toLowerCase().replace(/[^a-z0-9]/g, ''))

      keysToSet.forEach((k) => {
        if (!groupedSlots[k]) groupedSlots[k] = []
        if (!(groupedSlots[k] as Array<{ id: string }>).some((existing) => existing.id === formattedItem.id)) {
          groupedSlots[k].push(formattedItem)
        }
      })
    })

    // Fetch property meal slots for this location
    const propertyMealSlots = await FnbPropertyMealSlot.findAll({
      where: { locId },
      include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
    })

    // Fetch resident's active package if authenticated
    const userId = req.user?.id
    let activePkg: FnbResidentPackage | null | undefined = null

    if (userId) {
      let primaryResId = userId
      let famMemberId: string | null = null

      const fm = await ResidentFamilyMember.findByPk(userId)
      if (fm) {
        famMemberId = fm.id
        primaryResId = fm.residentId
      }

      const foundPkgs = await FnbResidentPackage.findAll({
        where: {
          [Op.or]: [{ residentId: primaryResId }, ...(famMemberId ? [{ familyMemberId: famMemberId }] : [])],
          status: ['active', 'ACTIVE', 'paused', 'PAUSED'],
        },
        include: [
          {
            model: FnbPropertyPackage,
            as: 'propertyPackage',
            include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
          },
        ],
      })

      if (famMemberId) {
        activePkg =
          foundPkgs.find((p) => p.familyMemberId === famMemberId) ||
          foundPkgs.find((p) => p.residentId === primaryResId && !p.familyMemberId) ||
          foundPkgs[0] ||
          null
      } else {
        activePkg = foundPkgs.find((p) => p.residentId === primaryResId && !p.familyMemberId) || foundPkgs[0] || null
      }
    }

    const globalSlots = await FnbGlobalMealSlot.findAll()
    const slotNameMap = new Map<string, string>()
    globalSlots.forEach((gs) => {
      if (gs.id) slotNameMap.set(gs.id, gs.name)
    })

    const formattedActivePackage = activePkg
      ? {
          id: activePkg.id,
          name: activePkg.propertyPackage?.globalPackage?.name || 'Active Package',
          code: activePkg.propertyPackage?.globalPackage?.code || 'PKG',
          dietaryType:
            activePkg.propertyPackage?.globalPackage?.dietaryType || activePkg.dietaryPreference || 'Standard',
          includedMealSlots: (activePkg.propertyPackage?.globalPackage?.includedMealSlots || []).map(
            (s: string) => slotNameMap.get(s) || s,
          ),
          status: activePkg.status || 'active',
          startDate: activePkg.startDate,
          endDate: activePkg.endDate || null,
        }
      : null

    res.status(200).json({
      success: true,
      data: {
        date: todayStr,
        locationId: locId,
        hasActivePackage: Boolean(formattedActivePackage),
        activePackage: formattedActivePackage,
        packageSubscription: formattedActivePackage,
        residentPackage: formattedActivePackage,
        foodPackage: formattedActivePackage,
        menu: groupedSlots,
        propertyMealSlots,
        menuItems,
      },
    })
  } catch (err) {
    console.error('Error fetching resident daily menu:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch daily menu' })
  }
}

export async function getResidentSpecialMenu(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locId = (req.query.locationId as string) || (req.query.locId as string) || req.user?.defaultLocationId
    if (!locId) {
      res.status(400).json({ success: false, message: 'locationId is required' })
      return
    }

    const slots = await FnbPropertySpecialSlot.findAll({
      where: { locId: String(locId), isActive: true },
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
        specialDishes?: Array<{
          id: string
          dishId: string
          dish?: {
            id: string
            name: string
            description?: string
            dietaryType?: string
            imageUrl?: string
          }
        }>
      }
      return {
        ...plain,
        price: Number(plain.price || 0),
        dishes: (plain.specialDishes || []).map((sd) => ({
          id: sd.id,
          dishId: sd.dishId,
          name: sd.dish?.name || 'Special Dish',
          description: sd.dish?.description || '',
          dietaryType: sd.dish?.dietaryType || 'Veg',
          imageUrl: sd.dish?.imageUrl || null,
        })),
      }
    })

    res.status(200).json({
      success: true,
      data: formatted,
    })
  } catch (err) {
    console.error('Error fetching resident special menu:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch special menu' })
  }
}

export async function placeMealOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      orderType = 'personal',
      orderMode,
      selectionType = 'dish',
      serviceType = 'room_service',
      date,
      mealSlotId,
      mealSlot,
      specialMealSlotId,
      items: rawItems,
      menuItemId: topMenuItemId,
      dishId: topDishId,
      quantity: topQuantity,
    } = req.body

    const targetOrderType = orderMode || orderType
    const targetDate = date || new Date().toISOString().split('T')[0]

    let itemsPayload: Array<{
      dishId?: string
      menuItemId?: string
      specialMealSlotDishId?: string
      quantity?: number
      unitPrice?: number
    }> = Array.isArray(rawItems) ? rawItems : []

    if (itemsPayload.length === 0 && topDishId) {
      itemsPayload = [
        {
          dishId: topDishId,
          menuItemId: topMenuItemId || undefined,
          quantity: topQuantity || 1,
        },
      ]
    }

    if (itemsPayload.length === 0 && selectionType === 'dish') {
      res.status(400).json({
        success: false,
        message: 'Please select at least one dish item to place an order',
      })
      return
    }

    // Resolve authenticated resident or family member
    const userId = req.user?.id
    let resident = await Resident.findByPk(userId)
    let familyMemberId: string | null = null

    if (!resident && userId) {
      const fm = await ResidentFamilyMember.findByPk(userId)
      if (fm) {
        familyMemberId = fm.id
        resident = await Resident.findByPk(fm.residentId)
      }
    }

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident account not found' })
      return
    }

    // Check if resident has active package
    const activePkg = await FnbResidentPackage.findOne({
      where: {
        [Op.or]: [{ residentId: resident.id }, ...(familyMemberId ? [{ familyMemberId }] : [])],
        status: ['active', 'ACTIVE'],
      },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
      ],
    })

    // Resolve meal slot string
    let resolvedMealSlot: string = (mealSlot as string) || 'breakfast'
    if (mealSlotId) {
      const pSlot = await FnbPropertyMealSlot.findByPk(mealSlotId, {
        include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
      })
      if (pSlot) {
        resolvedMealSlot = pSlot.globalMealSlot?.name || 'breakfast'
      } else {
        const gSlot = await FnbGlobalMealSlot.findByPk(mealSlotId)
        if (gSlot) resolvedMealSlot = gSlot.name
      }
    }

    // Determine package coverage for this specific meal slot
    let isPackageCovered = false
    if (targetOrderType === 'personal' && activePkg) {
      const gp = activePkg.propertyPackage?.globalPackage
      const includedSlots = gp?.includedMealSlots || []

      const globalSlots = await FnbGlobalMealSlot.findAll()
      const slotMap = new Map<string, string>()
      globalSlots.forEach((gs) => {
        if (gs.id) slotMap.set(gs.id, gs.name)
      })

      const targetSlotObj = mealSlotId
        ? await FnbPropertyMealSlot.findByPk(mealSlotId, {
            include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
          })
        : null

      const targetGlobalSlotId = targetSlotObj?.globalMealSlotId || null
      const targetSlotName = targetSlotObj?.globalMealSlot?.name || resolvedMealSlot

      isPackageCovered = includedSlots.some((inc: string) => {
        if (inc === targetGlobalSlotId || inc === mealSlotId) return true
        const incName = slotMap.get(inc) || inc
        return (
          incName.toLowerCase().replace(/[^a-z0-9]/g, '') === targetSlotName.toLowerCase().replace(/[^a-z0-9]/g, '')
        )
      })
    }

    const firstItem = itemsPayload[0]
    const totalQty = itemsPayload.reduce((sum, item) => sum + Number(item.quantity || 1), 0) || 1

    // Calculate item prices and total header amount
    let calculatedHeaderTotal = 0
    const detailsRecordsPayload = []

    for (const it of itemsPayload) {
      const targetDishId = it.dishId || firstItem?.dishId
      let unitPrice = Number(it.unitPrice || 0)

      if (!isPackageCovered && unitPrice === 0 && targetDishId) {
        const dishObj = await FnbDish.findByPk(targetDishId)
        if (dishObj && dishObj.basePrice) {
          unitPrice = Number(dishObj.basePrice)
        }
      }

      const qty = Number(it.quantity || 1)
      const itemAmount = isPackageCovered ? 0 : qty * unitPrice
      calculatedHeaderTotal += itemAmount

      if (targetDishId) {
        detailsRecordsPayload.push({
          dishId: targetDishId,
          mealSlotId: mealSlotId || null,
          specialMealSlotId: specialMealSlotId || null,
          specialMealSlotDishId: it.specialMealSlotDishId || null,
          quantity: qty,
          unitPrice: isPackageCovered ? 0 : unitPrice,
          amount: itemAmount,
          isPackageCovered,
          createdBy: req.user?.id || null,
        })
      }
    }

    if (!isPackageCovered && calculatedHeaderTotal === 0 && req.body.totalAmount) {
      calculatedHeaderTotal = Number(req.body.totalAmount)
    }

    const order = await FnbResidentOrder.create({
      locId: resident.locId,
      residentId: resident.id,
      familyMemberId,
      residentPackageId: activePkg?.id || null,
      date: targetDate,
      mealSlotId: mealSlotId || null,
      specialMealSlotId: specialMealSlotId || null,
      orderType: targetOrderType,
      selectionType,
      serviceType,
      quantity: totalQty,
      unitPrice: isPackageCovered ? 0 : detailsRecordsPayload[0]?.unitPrice || 0,
      totalAmount: isPackageCovered ? 0 : calculatedHeaderTotal,
      isPackageCovered,
      orderStatus: FnbOrderStatus.PLACED,
      menuItemId: firstItem?.menuItemId || topMenuItemId || null,
      dishId: firstItem?.dishId || topDishId || null,
      mealSlot: (resolvedMealSlot.toLowerCase().replace(/[^a-z0-9]/g, '_') as FnbMealSlot) || FnbMealSlot.BREAKFAST,
    })

    if (detailsRecordsPayload.length > 0) {
      try {
        const recordsToInsert = detailsRecordsPayload.map((rec) => ({
          ...rec,
          orderId: order.id,
          mealSlotId: null, // Avoid FK constraint mismatch on global/property slot ID
        }))
        await FnbResidentOrderDetail.bulkCreate(recordsToInsert)
      } catch (detailErr) {
        console.error('Error inserting order details:', detailErr)
      }
    }

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
