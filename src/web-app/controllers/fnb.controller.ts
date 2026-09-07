import { Request, Response } from 'express'
import {
  FnbDish,
  FnbPropertyDish,
  FnbGlobalMealSlot,
  FnbPropertyMealSlot,
  Property,
  FnbGlobalPackage,
  FnbPropertyPackage,
  FnbResidentPackage,
  FnbMenu,
  FnbMenuItem,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  FnbResidentOrder,
  FnbResidentOrderDetail,
  FnbFoodDelivery,
  FnbPropertySpecialSlot,
  User,
  UserDetail,
  Department,
  UserLocation,
  FnbGlobalSpecialSlot,
  FnbPropertySpecialSlotDish,
} from '../../models/index.js'
import { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../middlewares/s3/index.js'
import { FnbMenuStatus, FnbSubscriptionStatus, FnbDietaryType } from '../../enums/fnb.enum.js'
import { Op } from 'sequelize'

// ─── From dish.controller.ts ───────────────────────────────────────────
export async function getAllDishes(req: Request, res: Response): Promise<void> {
  try {
    const dishes = await FnbDish.findAll({
      include: [
        {
          model: FnbPropertyDish,
          as: 'propertyDishes',
          attributes: ['id', 'locId', 'price', 'isAvailable'],
        },
      ],
      order: [
        ['category', 'ASC'],
        ['name', 'ASC'],
      ],
    })
    res.status(200).json({
      success: true,
      data: dishes,
    })
  } catch (error) {
    console.error('Error fetching dishes:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch dishes' })
  }
}

export async function createDish(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, category, dietaryType, description, basePrice, nutritionalInfo, imageUrl, isActive, propertyIds } =
      req.body

    let finalImageUrl: string | null = imageUrl || null
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'fnb/dishes')
      finalImageUrl = s3Res.location
    } else if (finalImageUrl) {
      finalImageUrl = await uploadBase64ToS3(finalImageUrl, 'fnb/dishes')
    }

    const dish = await FnbDish.create({
      name,
      category,
      dietaryType,
      description: description || null,
      basePrice: Number(basePrice) || 0,
      nutritionalInfo: nutritionalInfo
        ? typeof nutritionalInfo === 'string'
          ? JSON.parse(nutritionalInfo)
          : nutritionalInfo
        : null,
      imageUrl: finalImageUrl,
      isActive: isActive !== undefined ? String(isActive) === 'true' || isActive === true : true,
      createdBy: req.user?.id || null,
    })

    // Parse propertyIds if passed in FormData
    let parsedPropIds: string[] = []
    if (Array.isArray(propertyIds)) {
      parsedPropIds = propertyIds
    } else if (typeof propertyIds === 'string' && propertyIds.trim()) {
      try {
        parsedPropIds = JSON.parse(propertyIds)
      } catch {
        parsedPropIds = [propertyIds]
      }
    }

    if (parsedPropIds.length > 0) {
      for (const locId of parsedPropIds) {
        await FnbPropertyDish.findOrCreate({
          where: { locId, dishId: dish.id },
          defaults: {
            locId,
            dishId: dish.id,
            price: Number(basePrice) || 0,
            isAvailable: true,
            createdBy: req.user?.id || null,
          },
        })
      }
    }

    res.status(201).json({
      success: true,
      message: 'Dish created successfully',
      data: dish,
    })
  } catch (error) {
    console.error('Error creating dish:', error)
    res.status(500).json({ success: false, message: 'Failed to create dish' })
  }
}

export async function updateDish(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { name, category, dietaryType, description, basePrice, nutritionalInfo, imageUrl, isActive, propertyIds } =
      req.body

    const dish = await FnbDish.findByPk(id)
    if (!dish) {
      res.status(404).json({ success: false, message: 'Dish not found' })
      return
    }

    let finalImageUrl = dish.imageUrl
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'fnb/dishes')
      finalImageUrl = s3Res.location
    } else if (imageUrl !== undefined) {
      finalImageUrl = await uploadBase64ToS3(imageUrl, 'fnb/dishes')
    }

    await dish.update({
      name: name || dish.name,
      category: category || dish.category,
      dietaryType: dietaryType || dish.dietaryType,
      description: description !== undefined ? description : dish.description,
      basePrice: basePrice !== undefined ? Number(basePrice) : dish.basePrice,
      nutritionalInfo: nutritionalInfo
        ? typeof nutritionalInfo === 'string'
          ? JSON.parse(nutritionalInfo)
          : nutritionalInfo
        : dish.nutritionalInfo,
      imageUrl: finalImageUrl,
      isActive: isActive !== undefined ? String(isActive) === 'true' || isActive === true : dish.isActive,
      updatedBy: req.user?.id || null,
    })

    // Parse propertyIds if passed in FormData
    if (propertyIds !== undefined) {
      let parsedPropIds: string[] = []
      if (Array.isArray(propertyIds)) {
        parsedPropIds = propertyIds
      } else if (typeof propertyIds === 'string' && propertyIds.trim()) {
        try {
          parsedPropIds = JSON.parse(propertyIds)
        } catch {
          parsedPropIds = [propertyIds]
        }
      }

      // Sync property assignments
      for (const locId of parsedPropIds) {
        const [propDish] = await FnbPropertyDish.findOrCreate({
          where: { locId, dishId: dish.id },
          defaults: {
            locId,
            dishId: dish.id,
            price: Number(basePrice) || dish.basePrice,
            isAvailable: true,
            createdBy: req.user?.id || null,
          },
        })
        if (!propDish.isAvailable) {
          await propDish.update({ isAvailable: true })
        }
      }

      // Deactivate unselected properties
      const existingPropDishes = await FnbPropertyDish.findAll({ where: { dishId: dish.id } })
      for (const epd of existingPropDishes) {
        if (!parsedPropIds.includes(epd.locId)) {
          await epd.update({ isAvailable: false })
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Dish updated successfully',
      data: dish,
    })
  } catch (error) {
    console.error('Error updating dish:', error)
    res.status(500).json({ success: false, message: 'Failed to update dish' })
  }
}

export async function getPropertyDishes(req: Request, res: Response): Promise<void> {
  try {
    const locId = req.params.locId as string
    const propertyDishes = await FnbPropertyDish.findAll({
      where: { locId, isAvailable: true },
      include: [{ model: FnbDish, as: 'dish' }],
    })
    res.status(200).json({
      success: true,
      data: propertyDishes,
    })
  } catch (error) {
    console.error('Error fetching property dishes:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch property dishes' })
  }
}

export async function setPropertyDishOverride(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { locId, dishId, price, isAvailable } = req.body

    const existing = await FnbPropertyDish.findOne({ where: { locId, dishId } })

    if (existing) {
      await existing.update({
        price: price !== undefined ? price : existing.price,
        isAvailable: isAvailable !== undefined ? isAvailable : existing.isAvailable,
        updatedBy: req.user?.id || null,
      })
      res.status(200).json({
        success: true,
        message: 'Property dish pricing updated',
        data: existing,
      })
      return
    }

    const created = await FnbPropertyDish.create({
      locId,
      dishId,
      price: price || 0,
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      createdBy: req.user?.id || null,
    })

    res.status(201).json({
      success: true,
      message: 'Property dish pricing set',
      data: created,
    })
  } catch (error) {
    console.error('Error setting property dish price:', error)
    res.status(500).json({ success: false, message: 'Failed to set property dish price' })
  }
}

// ─── From globalMealSlot.controller.ts ───────────────────────────────────────────
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

// ─── From globalPackage.controller.ts ───────────────────────────────────────────
async function validateMealSlotsForProperties(
  includedMealSlots: string[],
  propertyAssignments: Array<{ locId: string; price?: number }>,
): Promise<string | null> {
  if (!Array.isArray(propertyAssignments) || propertyAssignments.length === 0) {
    return null
  }
  if (!Array.isArray(includedMealSlots) || includedMealSlots.length === 0) {
    return 'Please select at least one meal slot for the package.'
  }

  for (const pa of propertyAssignments) {
    if (!pa.locId) continue

    const prop = await Property.findByPk(pa.locId)
    const propName =
      (prop as unknown as Record<string, string>)?.property_name ||
      (prop as unknown as Record<string, string>)?.propertyName ||
      (prop as unknown as Record<string, string>)?.name ||
      'Selected Property'

    const propertyMealSlots = await FnbPropertyMealSlot.findAll({
      where: { locId: pa.locId, isActive: true },
      include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
    })

    const availableSet = new Set<string>()
    propertyMealSlots.forEach((ps) => {
      if (ps.globalMealSlotId) availableSet.add(ps.globalMealSlotId)
      const g = ps.globalMealSlot as (FnbGlobalMealSlot & { code?: string }) | undefined
      if (g) {
        if (g.id) availableSet.add(g.id)
        if (g.code) {
          availableSet.add(g.code)
          availableSet.add(g.code.toLowerCase())
        }
        if (g.name) availableSet.add(g.name.toLowerCase())
      }
    })

    for (const reqSlot of includedMealSlots) {
      const isAvailable = availableSet.has(reqSlot) || availableSet.has(reqSlot.toLowerCase())

      if (!isAvailable) {
        let slotName = reqSlot
        const gSlot = await FnbGlobalMealSlot.findByPk(reqSlot)
        if (gSlot) slotName = gSlot.name

        return `Cannot assign package to property "${propName}": Required meal slot "${slotName}" is not configured/available for this property location.`
      }
    }
  }

  return null
}

export async function getAllGlobalPackages(req: Request, res: Response): Promise<void> {
  try {
    const packages = await FnbGlobalPackage.findAll({
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackages',
          include: [
            {
              model: Property,
              as: 'property',
              attributes: ['id', 'property_name', 'street', 'city', 'state'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    const packagesWithOptIn = await Promise.all(
      packages.map(async (pkg: FnbGlobalPackage) => {
        const propPkgIds = (pkg.propertyPackages || []).map((p: FnbPropertyPackage) => p.id)
        let hasOptedResidents = false
        if (propPkgIds.length > 0) {
          const count = await FnbResidentPackage.count({
            where: { propertyPackageId: propPkgIds },
          })
          hasOptedResidents = count > 0
        }
        return {
          ...pkg.toJSON(),
          hasOptedResidents,
        }
      }),
    )

    res.status(200).json({
      success: true,
      data: packagesWithOptIn,
    })
  } catch (error) {
    console.error('Error fetching global packages:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch global packages' })
  }
}

export async function createGlobalPackage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, code, description, dietaryType, includedMealSlots, isActive, propertyAssignments } = req.body

    if (!name || !code) {
      res.status(400).json({ success: false, message: 'Package Name and Code are required' })
      return
    }

    const existing = await FnbGlobalPackage.findOne({ where: { code } })
    if (existing) {
      res.status(400).json({ success: false, message: 'Package code already exists' })
      return
    }

    const mealSlotsToInclude = includedMealSlots || []
    const validationErr = await validateMealSlotsForProperties(mealSlotsToInclude, propertyAssignments || [])
    if (validationErr) {
      res.status(400).json({ success: false, message: validationErr })
      return
    }

    const pkg = await FnbGlobalPackage.create({
      name,
      code,
      description: description || null,
      dietaryType,
      includedMealSlots: mealSlotsToInclude,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.id || null,
    })

    if (Array.isArray(propertyAssignments) && propertyAssignments.length > 0) {
      for (const pa of propertyAssignments) {
        if (pa.locId) {
          await FnbPropertyPackage.create({
            locId: pa.locId,
            globalPackageId: pkg.id,
            price: Number(pa.price) || 0,
            isActive: true,
            createdBy: req.user?.id || null,
          })
        }
      }
    }

    const reloaded = await FnbGlobalPackage.findByPk(pkg.id, {
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackages',
          include: [
            { model: Property, as: 'property', attributes: ['id', 'property_name', 'street', 'city', 'state'] },
          ],
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Global package created successfully',
      data: {
        ...(reloaded ? reloaded.toJSON() : pkg.toJSON()),
        hasOptedResidents: false,
      },
    })
  } catch (error) {
    console.error('Error creating global package:', error)
    res.status(500).json({ success: false, message: 'Failed to create global package' })
  }
}

export async function updateGlobalPackage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { name, description, dietaryType, includedMealSlots, isActive, propertyAssignments } = req.body

    const pkg = await FnbGlobalPackage.findByPk(id, {
      include: [{ model: FnbPropertyPackage, as: 'propertyPackages' }],
    })
    if (!pkg) {
      res.status(404).json({ success: false, message: 'Global package not found' })
      return
    }

    const propPkgIds = (pkg.propertyPackages || []).map((p: FnbPropertyPackage) => p.id)
    let hasOptedResidents = false
    if (propPkgIds.length > 0) {
      const count = await FnbResidentPackage.count({
        where: { propertyPackageId: propPkgIds },
      })
      hasOptedResidents = count > 0
    }

    if (hasOptedResidents) {
      res.status(400).json({
        success: false,
        message: 'Cannot edit global package because one or more residents are currently opted into it.',
      })
      return
    }

    const slotsToValidate = includedMealSlots || pkg.includedMealSlots || []
    if (Array.isArray(propertyAssignments)) {
      const validationErr = await validateMealSlotsForProperties(slotsToValidate, propertyAssignments)
      if (validationErr) {
        res.status(400).json({ success: false, message: validationErr })
        return
      }
    }

    await pkg.update({
      name: name || pkg.name,
      description: description !== undefined ? description : pkg.description,
      dietaryType: dietaryType || pkg.dietaryType,
      includedMealSlots: includedMealSlots || pkg.includedMealSlots,
      isActive: isActive !== undefined ? isActive : pkg.isActive,
      updatedBy: req.user?.id || null,
    })

    if (Array.isArray(propertyAssignments)) {
      const assignedLocIds = propertyAssignments.map((pa: { locId: string }) => pa.locId)

      for (const existingPropPkg of pkg.propertyPackages || []) {
        if (!assignedLocIds.includes(existingPropPkg.locId)) {
          await existingPropPkg.destroy()
        }
      }

      for (const pa of propertyAssignments) {
        if (pa.locId) {
          const existing = await FnbPropertyPackage.findOne({
            where: { locId: pa.locId, globalPackageId: pkg.id },
          })
          if (existing) {
            await existing.update({
              price: pa.price !== undefined ? Number(pa.price) : existing.price,
              isActive: true,
              updatedBy: req.user?.id || null,
            })
          } else {
            await FnbPropertyPackage.create({
              locId: pa.locId,
              globalPackageId: pkg.id,
              price: Number(pa.price) || 0,
              isActive: true,
              createdBy: req.user?.id || null,
            })
          }
        }
      }
    }

    const reloaded = await FnbGlobalPackage.findByPk(pkg.id, {
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackages',
          include: [
            { model: Property, as: 'property', attributes: ['id', 'property_name', 'street', 'city', 'state'] },
          ],
        },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Global package updated successfully',
      data: {
        ...(reloaded ? reloaded.toJSON() : pkg.toJSON()),
        hasOptedResidents: false,
      },
    })
  } catch (error) {
    console.error('Error updating global package:', error)
    res.status(500).json({ success: false, message: 'Failed to update global package' })
  }
}

export async function deleteGlobalPackage(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const pkg = await FnbGlobalPackage.findByPk(id, {
      include: [{ model: FnbPropertyPackage, as: 'propertyPackages' }],
    })
    if (!pkg) {
      res.status(404).json({ success: false, message: 'Global package not found' })
      return
    }

    const propPkgIds = (pkg.propertyPackages || []).map((p: FnbPropertyPackage) => p.id)
    if (propPkgIds.length > 0) {
      const count = await FnbResidentPackage.count({
        where: { propertyPackageId: propPkgIds },
      })
      if (count > 0) {
        res.status(400).json({
          success: false,
          message: 'Cannot delete global package because one or more residents are currently opted into it.',
        })
        return
      }
    }

    await FnbPropertyPackage.destroy({ where: { globalPackageId: id } })
    await pkg.destroy()
    res.status(200).json({ success: true, message: 'Global package deleted successfully' })
  } catch (error) {
    console.error('Error deleting global package:', error)
    res.status(500).json({ success: false, message: 'Failed to delete global package' })
  }
}

// ─── From menu.controller.ts ───────────────────────────────────────────
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
          mealSlot?: string
          mealSlotId?: string | null
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
          mealSlot: item.mealSlot || null,
          mealSlotId: item.mealSlotId || null,
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
    const { menuId, locId, dayOfWeek, date, isOverride, mealSlot, mealSlotId, dishId, isOptional, extraPrice, notes } =
      req.body

    if (!locId || (!mealSlot && !mealSlotId) || !dishId) {
      res.status(400).json({ success: false, message: 'locId, mealSlot (or mealSlotId), and dishId are required' })
      return
    }

    // Find or create active draft menu for location
    let targetMenuId = menuId
    if (!targetMenuId) {
      const [menu] = await FnbMenu.findOrCreate({
        where: { locId, status: FnbMenuStatus.DRAFT },
        defaults: {
          locId,
          title: 'Weekly Menu',
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
      dishId,
    }
    if (mealSlotId) {
      whereClause.mealSlotId = mealSlotId
    } else {
      whereClause.mealSlot = mealSlot
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
      mealSlot: mealSlot || null,
      mealSlotId: mealSlotId || null,
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

// ─── From propertyMealSlot.controller.ts ───────────────────────────────────────────
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

// Deduplicated parseTimeToMinutes

interface TimeInterval {
  start: number
  end: number
}

// Deduplicated getSlotIntervals

// Deduplicated isTimeOverlapping

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

// ─── From propertyPackage.controller.ts ───────────────────────────────────────────
export async function getPropertyPackages(req: Request, res: Response): Promise<void> {
  try {
    const locId = req.params.locId as string
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : ''

    const packages = await FnbPropertyPackage.findAll({
      where: { locId },
      include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
      order: [['createdAt', 'DESC']],
    })

    const packagesWithOptIn = await Promise.all(
      packages.map(async (pkg: FnbPropertyPackage) => {
        let optedSubscriptions = await FnbResidentPackage.findAll({
          where: {
            propertyPackageId: pkg.id,
            status: [FnbSubscriptionStatus.ACTIVE, FnbSubscriptionStatus.PAUSED, FnbSubscriptionStatus.CANCELLED],
          },
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'residentType', 'isResiding'],
              include: [
                {
                  model: PropertyUnit,
                  as: 'unit',
                  attributes: ['id', 'unit_number'],
                  include: [
                    {
                      model: PropertyFloor,
                      as: 'floor',
                      attributes: ['id', 'floor_number', 'floor_name'],
                      include: [
                        {
                          model: PropertyBlock,
                          as: 'block',
                          attributes: ['id', 'block_name'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              model: ResidentFamilyMember,
              as: 'familyMember',
              attributes: ['id', 'residentId', 'firstName', 'lastName', 'relation', 'phone'],
              include: [
                {
                  model: Resident,
                  as: 'resident',
                  attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'residentType', 'isResiding'],
                  include: [
                    {
                      model: PropertyUnit,
                      as: 'unit',
                      attributes: ['id', 'unit_number'],
                      include: [
                        {
                          model: PropertyFloor,
                          as: 'floor',
                          attributes: ['id', 'floor_number', 'floor_name'],
                          include: [
                            {
                              model: PropertyBlock,
                              as: 'block',
                              attributes: ['id', 'block_name'],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              model: FnbPropertyPackage,
              as: 'propertyPackage',
              include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
            },
          ],
          order: [['createdAt', 'DESC']],
        })

        if (search) {
          optedSubscriptions = optedSubscriptions.filter((sub) => {
            const primaryName = sub.resident
              ? `${sub.resident.firstName} ${sub.resident.lastName || ''}`.toLowerCase()
              : ''
            const familyName = sub.familyMember
              ? `${sub.familyMember.firstName} ${sub.familyMember.lastName || ''}`.toLowerCase()
              : ''
            const targetRes = sub.resident || sub.familyMember?.resident
            const unitNum = targetRes?.unit?.unit_number?.toLowerCase() || ''
            const unitObj = targetRes?.unit as unknown as { floor?: { block?: { block_name?: string } } } | undefined
            const blockName = unitObj?.floor?.block?.block_name?.toLowerCase() || ''
            const pkgName = pkg.globalPackage?.name?.toLowerCase() || ''

            return (
              primaryName.includes(search) ||
              familyName.includes(search) ||
              unitNum.includes(search) ||
              blockName.includes(search) ||
              pkgName.includes(search)
            )
          })
        }

        return {
          ...pkg.toJSON(),
          hasOptedResidents: optedSubscriptions.length > 0,
          optedCount: optedSubscriptions.length,
          optedResidents: optedSubscriptions,
        }
      }),
    )

    res.status(200).json({
      success: true,
      data: packagesWithOptIn,
    })
  } catch (error) {
    console.error('Error fetching property packages:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch property packages' })
  }
}

export async function assignPropertyPackage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { locId, globalPackageId, price, isActive } = req.body

    const existing = await FnbPropertyPackage.findOne({
      where: { locId, globalPackageId },
    })

    if (existing) {
      const count = await FnbResidentPackage.count({
        where: { propertyPackageId: existing.id },
      })
      if (count > 0) {
        res.status(400).json({
          success: false,
          message: 'Cannot edit property package pricing because one or more residents are currently opted into it.',
        })
        return
      }

      await existing.update({
        price: price !== undefined ? price : existing.price,
        isActive: isActive !== undefined ? isActive : existing.isActive,
        updatedBy: req.user?.id || null,
      })
      const reloaded = await FnbPropertyPackage.findByPk(existing.id, {
        include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
      })
      res.status(200).json({
        success: true,
        message: 'Property package pricing updated',
        data: {
          ...(reloaded ? reloaded.toJSON() : existing.toJSON()),
          hasOptedResidents: false,
        },
      })
      return
    }

    const created = await FnbPropertyPackage.create({
      locId,
      globalPackageId,
      price: price || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.id || null,
    })

    const result = await FnbPropertyPackage.findByPk(created.id, {
      include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
    })

    res.status(201).json({
      success: true,
      message: 'Package assigned to property successfully',
      data: {
        ...(result ? result.toJSON() : created.toJSON()),
        hasOptedResidents: false,
      },
    })
  } catch (error) {
    console.error('Error assigning property package:', error)
    res.status(500).json({ success: false, message: 'Failed to assign package to property' })
  }
}

export async function deletePropertyPackage(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const pkg = await FnbPropertyPackage.findByPk(id)
    if (!pkg) {
      res.status(404).json({ success: false, message: 'Property package not found' })
      return
    }

    const count = await FnbResidentPackage.count({
      where: { propertyPackageId: id },
    })
    if (count > 0) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete property package because one or more residents are currently opted into it.',
      })
      return
    }

    await pkg.destroy()
    res.status(200).json({ success: true, message: 'Property package removed successfully' })
  } catch (error) {
    console.error('Error removing property package:', error)
    res.status(500).json({ success: false, message: 'Failed to remove property package' })
  }
}

// ─── From residentOrder.controller.ts ───────────────────────────────────────────
export async function getResidentOrdersForProperty(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest
    const locId =
      (req.query.locId as string) ||
      (req.params.locId as string) ||
      authReq.locationId ||
      authReq.user?.defaultLocationId ||
      undefined
    const { date, orderStatus, orderType, search, assignedEmployeeId } = req.query

    const whereClause: Record<string, unknown> = {}
    if (locId) {
      whereClause.locId = locId
    }

    if (!locId && !assignedEmployeeId) {
      res.status(400).json({ success: false, message: 'locId or assignedEmployeeId is required' })
      return
    }

    if (date) {
      whereClause.date = String(date)
    }

    if (orderStatus) {
      whereClause.orderStatus = String(orderStatus)
    }

    if (orderType) {
      whereClause.orderType = String(orderType)
    }

    if (assignedEmployeeId) {
      whereClause.assignedEmployeeId = String(assignedEmployeeId)
    }

    const orders = await FnbResidentOrder.findAll({
      where: whereClause,
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
          include: [
            {
              model: PropertyUnit,
              as: 'unit',
              attributes: ['id', 'unit_number'],
              include: [
                {
                  model: PropertyFloor,
                  as: 'floor',
                  attributes: ['id', 'floor_number', 'floor_name'],
                  include: [
                    {
                      model: PropertyBlock,
                      as: 'block',
                      attributes: ['id', 'block_name'],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: ResidentFamilyMember,
          as: 'familyMember',
          attributes: ['id', 'firstName', 'lastName', 'relation', 'phone'],
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
              include: [
                {
                  model: PropertyUnit,
                  as: 'unit',
                  attributes: ['id', 'unit_number'],
                  include: [
                    {
                      model: PropertyFloor,
                      as: 'floor',
                      attributes: ['id', 'floor_number', 'floor_name'],
                      include: [
                        {
                          model: PropertyBlock,
                          as: 'block',
                          attributes: ['id', 'block_name'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: FnbPropertySpecialSlot,
          as: 'specialMealSlot',
          attributes: ['id', 'name', 'price'],
        },
        {
          model: FnbGlobalMealSlot,
          as: 'globalMealSlot',
          attributes: ['id', 'name', 'code'],
        },
        {
          model: FnbResidentOrderDetail,
          as: 'details',
          include: [
            { model: FnbDish, as: 'dish', attributes: ['id', 'name', 'category', 'basePrice', 'imageUrl'] },
            { model: FnbGlobalMealSlot, as: 'globalMealSlot', attributes: ['id', 'name', 'code'] },
            { model: FnbPropertySpecialSlot, as: 'specialMealSlot', attributes: ['id', 'name'] },
          ],
        },
        {
          model: User,
          as: 'assignedEmployee',
          attributes: ['id', 'username', 'email', 'phone'],
          include: [
            {
              model: UserDetail,
              as: 'profile',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'employeeCode', 'photoUrl'],
            },
          ],
        },
        {
          model: FnbFoodDelivery,
          as: 'delivery',
          include: [
            {
              model: User,
              as: 'employee',
              attributes: ['id', 'username', 'email', 'phone'],
            },
            {
              model: UserDetail,
              as: 'employeeDetail',
              attributes: ['id', 'userId', 'firstName', 'lastName', 'phone', 'employeeCode', 'photoUrl'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    // Filter by search query if provided (searching resident name, unit number, block, floor, or order ID)
    let filteredOrders = orders
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase()
      filteredOrders = orders.filter((o) => {
        const plain = o.get({ plain: true }) as unknown as {
          id?: string
          resident?: {
            firstName?: string
            lastName?: string
            unit?: {
              unit_number?: string
              floor?: {
                floor_name?: string
                floor_number?: number | string
                block?: {
                  block_name?: string
                }
              }
            }
          }
          familyMember?: {
            firstName?: string
            lastName?: string
            resident?: {
              unit?: {
                unit_number?: string
                floor?: {
                  floor_name?: string
                  floor_number?: number | string
                  block?: {
                    block_name?: string
                  }
                }
              }
            }
          }
        }
        const resName = `${plain.resident?.firstName || ''} ${plain.resident?.lastName || ''}`.toLowerCase()
        const famName = `${plain.familyMember?.firstName || ''} ${plain.familyMember?.lastName || ''}`.toLowerCase()
        const unitObj = plain.resident?.unit || plain.familyMember?.resident?.unit
        const unitNum = (unitObj?.unit_number || '').toLowerCase()
        const floorName = (
          unitObj?.floor?.floor_name ||
          (unitObj?.floor?.floor_number !== undefined ? `floor ${unitObj.floor.floor_number}` : '')
        ).toLowerCase()
        const blockName = (unitObj?.floor?.block?.block_name || '').toLowerCase()
        const orderId = (plain.id || '').toLowerCase()
        return (
          resName.includes(q) ||
          famName.includes(q) ||
          unitNum.includes(q) ||
          floorName.includes(q) ||
          blockName.includes(q) ||
          orderId.includes(q)
        )
      })
    }

    res.status(200).json({ success: true, data: filteredOrders })
  } catch (error) {
    console.error('Error fetching resident orders:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch resident orders' })
  }
}

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  try {
    const orderId = String(req.params.id)
    const { orderStatus } = req.body

    const order = await FnbResidentOrder.findByPk(orderId)
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' })
      return
    }

    const nextStatus = String(orderStatus).toLowerCase()
    order.orderStatus = nextStatus

    const now = new Date()
    if (nextStatus === 'accepted' && !order.acceptedAt) {
      order.acceptedAt = now
    } else if (nextStatus === 'preparing' && !order.preparingStartedAt) {
      order.preparingStartedAt = now
    } else if (nextStatus === 'ready' && !order.readyAt) {
      order.readyAt = now
    } else if ((nextStatus === 'completed' || nextStatus === 'delivered') && !order.deliveredAt) {
      order.deliveredAt = now
    }

    order.updatedBy = (req as Request & { user?: { id?: string } }).user?.id || null
    await order.save()

    res.status(200).json({ success: true, data: order })
  } catch (error) {
    console.error('Error updating order status:', error)
    res.status(500).json({ success: false, message: 'Failed to update order status' })
  }
}

export async function assignDeliveryEmployee(req: Request, res: Response): Promise<void> {
  try {
    const orderId = String(req.params.id)
    const { employeeId, deliveryCharge = 0 } = req.body
    const userId = (req as Request & { user?: { id?: string } }).user?.id || null

    const order = await FnbResidentOrder.findByPk(orderId)
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' })
      return
    }

    const chargeNum = Math.max(0, Number(deliveryCharge || 0))

    // Update order status & delivery charge
    order.orderStatus = 'delivering_to_room'
    order.deliveryCharge = chargeNum
    order.assignedEmployeeId = employeeId || null
    order.updatedBy = userId

    // Adjust totalAmount if delivery charge was added
    if (chargeNum > 0) {
      order.totalAmount = Number(order.totalAmount || 0) + chargeNum
    }
    await order.save()

    // Upsert FnbFoodDelivery record
    let delivery = await FnbFoodDelivery.findOne({ where: { orderId: order.id } })
    if (delivery) {
      delivery.employeeId = employeeId || null
      delivery.deliveryCharge = chargeNum
      delivery.deliveryStatus = 'delivering'
      delivery.updatedBy = userId
      await delivery.save()
    } else {
      delivery = await FnbFoodDelivery.create({
        locId: order.locId,
        orderId: order.id,
        employeeId: employeeId || null,
        deliveryCharge: chargeNum,
        deliveryStatus: 'delivering',
        deliveryDate: String(order.date),
        createdBy: userId,
      })
    }

    res.status(200).json({
      success: true,
      message: 'Delivery employee assigned successfully',
      data: { order, delivery },
    })
  } catch (error) {
    console.error('Error assigning delivery employee:', error)
    res.status(500).json({ success: false, message: 'Failed to assign delivery employee' })
  }
}

export async function completeRoomDelivery(req: Request, res: Response): Promise<void> {
  try {
    const orderId = String(req.params.id)
    let { photoUrl } = req.body
    const userId = (req as Request & { user?: { id?: string } }).user?.id || null

    if (photoUrl && photoUrl.startsWith('data:')) {
      photoUrl = await uploadBase64ToS3(photoUrl, 'fnb/deliveries')
    }

    const order = await FnbResidentOrder.findByPk(orderId)
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' })
      return
    }

    const now = new Date()
    order.orderStatus = 'completed'
    order.deliveredAt = now
    order.updatedBy = userId
    await order.save()

    let delivery = await FnbFoodDelivery.findOne({ where: { orderId: order.id } })
    if (delivery) {
      delivery.deliveryStatus = 'delivered'
      if (photoUrl) delivery.photoUrl = photoUrl
      delivery.deliveredAt = now
      delivery.updatedBy = userId
      await delivery.save()
    } else {
      delivery = await FnbFoodDelivery.create({
        locId: order.locId,
        orderId: order.id,
        employeeId: order.assignedEmployeeId || null,
        deliveryCharge: order.deliveryCharge || 0,
        deliveryStatus: 'delivered',
        photoUrl: photoUrl || null,
        deliveryDate: String(order.date),
        deliveredAt: now,
        createdBy: userId,
      })
    }

    res.status(200).json({
      success: true,
      message: 'Room delivery completed successfully',
      data: { order, delivery },
    })
  } catch (error) {
    console.error('Error completing room delivery:', error)
    res.status(500).json({ success: false, message: 'Failed to complete room delivery' })
  }
}

export async function getFnbStaffEmployees(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest
    const locId =
      (req.query.locId as string) ||
      (req.query.locationId as string) ||
      authReq.locationId ||
      authReq.user?.defaultLocationId ||
      undefined

    // Find Food & Beverage department
    const fnbDepartment = await Department.findOne({
      where: {
        [Op.or]: [{ code: 'FNB' }, { name: { [Op.like]: '%Food%Beverage%' } }],
        isActive: true,
      },
    })

    if (!fnbDepartment) {
      res.status(200).json({ success: true, data: [] })
      return
    }

    // Find user locations assigned to FNB department
    const userLocWhere: Record<string, unknown> = {
      departmentId: fnbDepartment.id,
      isDeleted: false,
    }
    if (locId) {
      userLocWhere.locId = locId
    }

    const userLocations = await UserLocation.findAll({
      where: userLocWhere,
      attributes: ['userId'],
    })

    const fnbUserIds = Array.from(new Set(userLocations.map((ul) => ul.userId)))

    if (fnbUserIds.length === 0) {
      res.status(200).json({ success: true, data: [] })
      return
    }

    const users = await User.findAll({
      where: {
        id: { [Op.in]: fnbUserIds },
        isDeleted: false,
        isActive: true,
      },
      attributes: ['id', 'username', 'email', 'phone', 'status', 'isActive'],
      include: [
        {
          model: UserDetail,
          as: 'profile',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'employeeCode', 'photoUrl'],
          required: false,
        },
      ],
    })

    res.status(200).json({
      success: true,
      data: users,
    })
  } catch (error) {
    console.error('Error fetching F&B staff employees:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch staff employees' })
  }
}

// ─── From residentPackage.controller.ts ───────────────────────────────────────────
export async function getResidentPackage(req: Request, res: Response): Promise<void> {
  try {
    const residentId = req.params.residentId as string

    // Fetch family member IDs under this primary resident
    const fmList = await ResidentFamilyMember.findAll({
      where: { residentId, isDeleted: false },
      attributes: ['id'],
    })
    const fmIds = fmList.map((fm) => fm.id)

    const subscriptions = await FnbResidentPackage.findAll({
      where: {
        [Op.or]: [
          { residentId },
          { familyMemberId: residentId },
          ...(fmIds.length > 0 ? [{ familyMemberId: fmIds }] : []),
        ],
        status: [FnbSubscriptionStatus.ACTIVE, FnbSubscriptionStatus.PAUSED, 'active', 'ACTIVE', 'paused', 'PAUSED'],
      },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
        {
          model: ResidentFamilyMember,
          as: 'familyMember',
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'residentType', 'isResiding'],
              include: [
                {
                  model: PropertyUnit,
                  as: 'unit',
                  attributes: ['id', 'unit_number'],
                  include: [
                    {
                      model: PropertyFloor,
                      as: 'floor',
                      attributes: ['id', 'floor_number', 'floor_name'],
                      include: [
                        {
                          model: PropertyBlock,
                          as: 'block',
                          attributes: ['id', 'block_name'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    res.status(200).json({
      success: true,
      data: subscriptions,
    })
  } catch (error) {
    console.error('Error fetching resident package:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch resident package' })
  }
}

interface SubscriptionInput {
  familyMemberId?: string | null
  propertyPackageId?: string | null
  startDate?: string | null
}

export async function assignResidentPackage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { residentId, propertyPackageId, startDate, endDate, subscriptions } = req.body

    // 1. Verify resident exists & is currently residing!
    const resident = await Resident.findByPk(residentId)
    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    if (!resident.isResiding) {
      res.status(400).json({
        success: false,
        message: 'Food packages can only be assigned to currently residing residents (isResiding must be true).',
      })
      return
    }

    // Build subList from subscriptions payload or single propertyPackageId
    let subList: SubscriptionInput[] = []
    if (Array.isArray(subscriptions) && subscriptions.length > 0) {
      subList = subscriptions
    } else if (propertyPackageId) {
      subList = [{ familyMemberId: null, propertyPackageId, startDate }]
    }

    if (subList.length === 0) {
      res.status(400).json({ success: false, message: 'No food package selections provided.' })
      return
    }

    const createdSubscriptions: FnbResidentPackage[] = []
    const todayStr: string = new Date().toISOString().split('T')[0] as string

    for (const sub of subList) {
      const famId = sub.familyMemberId || (sub as unknown as Record<string, string>).family_member_id || null
      const propPkgId = sub.propertyPackageId || (sub as unknown as Record<string, string>).property_package_id || null
      const itemStartDate =
        sub.startDate || (sub as unknown as Record<string, string>).start_date || startDate || todayStr

      // Check existing active or paused subscription for this person
      const whereCondition: Record<string, unknown> = {
        status: [FnbSubscriptionStatus.ACTIVE, FnbSubscriptionStatus.PAUSED, 'active', 'ACTIVE', 'paused', 'PAUSED'],
      }

      if (famId) {
        whereCondition.familyMemberId = famId
      } else {
        whereCondition.residentId = residentId
        whereCondition.familyMemberId = null
      }

      const existingActive = await FnbResidentPackage.findOne({ where: whereCondition })

      // If existing subscription already matches the target package, DO NOT re-insert or cancel!
      if (existingActive && propPkgId && existingActive.propertyPackageId === propPkgId) {
        createdSubscriptions.push(existingActive)
        continue
      }

      // If package changed or set to null, deactivate previous subscription
      if (existingActive) {
        await existingActive.update({
          status: FnbSubscriptionStatus.CANCELLED,
          endDate: todayStr,
          updatedBy: req.user?.id || null,
        })
      }

      // If a new propertyPackageId is provided, create new subscription
      if (propPkgId) {
        const propertyPackage = await FnbPropertyPackage.findByPk(propPkgId, {
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        })

        if (propertyPackage && propertyPackage.isActive) {
          const dietaryPref = (propertyPackage.globalPackage?.dietaryType as FnbDietaryType) || FnbDietaryType.VEG

          const newSubscription = await FnbResidentPackage.create({
            residentId: famId ? null : residentId,
            familyMemberId: famId,
            propertyPackageId: propPkgId,
            startDate: itemStartDate,
            endDate: endDate || null,
            dietaryPreference: dietaryPref,
            allergiesNotes: null,
            status: FnbSubscriptionStatus.ACTIVE,
            createdBy: req.user?.id || null,
          })

          createdSubscriptions.push(newSubscription)
        }
      }
    }

    // Fetch all active subscriptions under this primary resident and family members
    const familyMemberIds = (
      await ResidentFamilyMember.findAll({ where: { residentId: resident.id }, attributes: ['id'] })
    ).map((f) => f.id)

    const allActive = await FnbResidentPackage.findAll({
      where: {
        [Op.or]: [
          { residentId: resident.id },
          ...(familyMemberIds.length > 0 ? [{ familyMemberId: familyMemberIds }] : []),
        ],
        status: [FnbSubscriptionStatus.ACTIVE, 'active', 'ACTIVE'],
      },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
        {
          model: ResidentFamilyMember,
          as: 'familyMember',
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'residentType', 'isResiding'],
              include: [
                {
                  model: PropertyUnit,
                  as: 'unit',
                  attributes: ['id', 'unit_number'],
                  include: [
                    {
                      model: PropertyFloor,
                      as: 'floor',
                      attributes: ['id', 'floor_number', 'floor_name'],
                      include: [
                        {
                          model: PropertyBlock,
                          as: 'block',
                          attributes: ['id', 'block_name'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Food package subscription updated successfully',
      data: allActive,
    })
  } catch (error) {
    console.error('Error assigning resident package:', error)
    res.status(500).json({ success: false, message: 'Failed to assign food package to resident' })
  }
}

export async function togglePauseResidentPackage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const subscription = await FnbResidentPackage.findByPk(id)
    if (!subscription) {
      res.status(404).json({ success: false, message: 'Subscription not found' })
      return
    }

    const newStatus =
      subscription.status === FnbSubscriptionStatus.ACTIVE ? FnbSubscriptionStatus.PAUSED : FnbSubscriptionStatus.ACTIVE

    await subscription.update({
      status: newStatus,
      updatedBy: req.user?.id || null,
    })

    res.status(200).json({
      success: true,
      message: `Subscription ${newStatus === FnbSubscriptionStatus.PAUSED ? 'paused' : 'resumed'} successfully`,
      data: subscription,
    })
  } catch (error) {
    console.error('Error toggling pause for resident package:', error)
    res.status(500).json({ success: false, message: 'Failed to update subscription status' })
  }
}

export async function changeResidentPackage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { subscriptionId, newPropertyPackageId, startDate, allergiesNotes } = req.body
    if (!subscriptionId || !newPropertyPackageId) {
      res.status(400).json({ success: false, message: 'subscriptionId and newPropertyPackageId are required' })
      return
    }

    const existingSub = await FnbResidentPackage.findByPk(subscriptionId)
    if (!existingSub) {
      res.status(404).json({ success: false, message: 'Existing subscription not found' })
      return
    }

    const todayStr: string = new Date().toISOString().split('T')[0] as string

    // 1. Mark existing package subscription as inactive/cancelled and set end date
    await existingSub.update({
      status: FnbSubscriptionStatus.CANCELLED,
      endDate: todayStr,
      updatedBy: req.user?.id || null,
    })

    // Also deactivate any other active/paused subscriptions for this resident/family member
    const whereCondition: Record<string, unknown> = {
      residentId: existingSub.residentId,
      status: [FnbSubscriptionStatus.ACTIVE, FnbSubscriptionStatus.PAUSED],
    }
    if (existingSub.familyMemberId) {
      whereCondition.familyMemberId = existingSub.familyMemberId
    } else {
      whereCondition.familyMemberId = null
    }

    await FnbResidentPackage.update(
      { status: FnbSubscriptionStatus.CANCELLED, endDate: todayStr, updatedBy: req.user?.id || null },
      { where: whereCondition },
    )

    // 2. Create new package subscription
    const newPropPkg = await FnbPropertyPackage.findByPk(newPropertyPackageId, {
      include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
    })

    if (!newPropPkg || !newPropPkg.isActive) {
      res.status(400).json({ success: false, message: 'Target property package is invalid or inactive' })
      return
    }

    const dietaryPref = (newPropPkg.globalPackage?.dietaryType as FnbDietaryType) || FnbDietaryType.VEG

    const newSub = await FnbResidentPackage.create({
      residentId: existingSub.residentId,
      familyMemberId: existingSub.familyMemberId,
      propertyPackageId: newPropertyPackageId,
      startDate: startDate || todayStr,
      endDate: null,
      dietaryPreference: dietaryPref,
      allergiesNotes: allergiesNotes !== undefined ? allergiesNotes : existingSub.allergiesNotes,
      status: FnbSubscriptionStatus.ACTIVE,
      createdBy: req.user?.id || null,
    })

    res.status(201).json({
      success: true,
      message: 'Package changed successfully',
      data: newSub,
    })
  } catch (error) {
    console.error('Error changing resident package:', error)
    res.status(500).json({ success: false, message: 'Failed to change resident package' })
  }
}

export async function cancelResidentPackage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = req.params.residentId as string
    const endDateVal: string = new Date().toISOString().split('T')[0] as string

    await FnbResidentPackage.update(
      { status: FnbSubscriptionStatus.CANCELLED, endDate: endDateVal, updatedBy: req.user?.id || null },
      { where: { residentId, status: [FnbSubscriptionStatus.ACTIVE, FnbSubscriptionStatus.PAUSED] } },
    )

    res.status(200).json({
      success: true,
      message: 'Food package subscriptions cancelled for resident',
    })
  } catch (error) {
    console.error('Error cancelling resident package:', error)
    res.status(500).json({ success: false, message: 'Failed to cancel food package subscription' })
  }
}

// ─── From specialSlot.controller.ts ───────────────────────────────────────────
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
