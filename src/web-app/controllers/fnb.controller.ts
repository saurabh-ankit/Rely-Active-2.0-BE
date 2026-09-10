import { Request, Response } from 'express'
import sequelize from '../../config/db/index.js'
import {
  FnbFoodAttendance,
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
    const locId =
      (req.params.locId as string) ||
      (req.query.locId as string) ||
      (req.query.locationId as string) ||
      (req.headers['x-location-id'] as string) ||
      (req.headers['x-property-id'] as string)
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
      (req.params.locId as string) ||
      (req.query.locId as string) ||
      (req.query.locationId as string) ||
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
    const locId =
      (req.params.locId as string) ||
      (req.query.locId as string) ||
      (req.query.locationId as string) ||
      (req.headers['x-location-id'] as string) ||
      (req.headers['x-property-id'] as string)
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

    // Determine food subtotal (for package covered or room service personal meals covered in package, food subtotal is 0)
    let foodSubtotal = 0
    if (!order.isPackageCovered) {
      const details = await FnbResidentOrderDetail.findAll({ where: { orderId: order.id } })
      if (details && details.length > 0) {
        foodSubtotal = details.reduce((sum, d) => sum + Number(d.amount || 0), 0)
      } else {
        const prevDeliveryCharge = Number(order.deliveryCharge || 0)
        const prevTotal = Number(order.totalAmount || 0)
        foodSubtotal = Math.max(0, prevTotal - prevDeliveryCharge)
      }
    }

    // Update order status & delivery charge
    order.orderStatus = 'delivering_to_room'
    order.deliveryCharge = chargeNum
    order.assignedEmployeeId = employeeId || null
    order.updatedBy = userId
    order.totalAmount = foodSubtotal + chargeNum

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
    const locId =
      (req.params.locId as string) ||
      (req.query.locId as string) ||
      (req.query.locationId as string) ||
      (req.headers['x-location-id'] as string) ||
      (req.headers['x-property-id'] as string)
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

// ─── Food Attendance Controllers ─────────────────────────────────────────────

function getUnitFullLocation(unit: PropertyUnit | undefined | null): string {
  if (!unit) return 'N/A'
  const parts: string[] = []
  const blockName = unit.floor?.block?.block_name
  if (blockName) {
    parts.push(
      blockName.toLowerCase().startsWith('block') || blockName.toLowerCase().startsWith('tower')
        ? blockName
        : `Block ${blockName}`,
    )
  }
  const floorName =
    unit.floor?.floor_name || (unit.floor?.floor_number !== undefined ? `Floor ${unit.floor.floor_number}` : '')
  if (floorName) parts.push(floorName)

  const unitNum = unit.unit_number
  if (unitNum) {
    parts.push(unitNum.toLowerCase().startsWith('flat') ? unitNum : `Flat ${unitNum}`)
  }
  return parts.length > 0 ? parts.join(' • ') : 'N/A'
}

export const getResidingMembersAndFlats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { locId, date: dateQuery, search, mealSlotKey } = req.query
    if (!locId) {
      res.status(400).json({ success: false, message: 'Property locId is required' })
      return
    }

    const targetDate = typeof dateQuery === 'string' && dateQuery ? dateQuery : new Date().toISOString().split('T')[0]!

    // 1. Fetch active residing primary residents for property
    const residents = await Resident.findAll({
      where: {
        locId: String(locId),
        isResiding: true,
        isDeleted: false,
      },
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              include: [{ model: PropertyBlock, as: 'block' }],
            },
          ],
        },
        {
          model: FnbResidentPackage,
          as: 'fnbPackages',
          where: { status: FnbSubscriptionStatus.ACTIVE },
          required: false,
          include: [
            {
              model: FnbPropertyPackage,
              as: 'propertyPackage',
              include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
            },
          ],
        },
      ],
    })

    // 2. Fetch active residing family members for property
    const familyMembers = await ResidentFamilyMember.findAll({
      where: {
        isResiding: true,
        isDeleted: false,
      },
      include: [
        {
          model: Resident,
          as: 'resident',
          where: {
            locId: String(locId),
            isDeleted: false,
          },
          required: true,
          include: [
            {
              model: PropertyUnit,
              as: 'unit',
              include: [
                {
                  model: PropertyFloor,
                  as: 'floor',
                  include: [{ model: PropertyBlock, as: 'block' }],
                },
              ],
            },
          ],
        },
        {
          model: FnbResidentPackage,
          as: 'fnbPackages',
          where: { status: FnbSubscriptionStatus.ACTIVE },
          required: false,
          include: [
            {
              model: FnbPropertyPackage,
              as: 'propertyPackage',
              include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
            },
          ],
        },
      ],
    })

    // 3. Fetch existing attendance records for location & date
    const attendances = await FnbFoodAttendance.findAll({
      where: {
        locId: String(locId),
        date: targetDate,
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'email'],
          include: [
            {
              model: UserDetail,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'employeeCode'],
            },
          ],
        },
        {
          model: FnbPropertyMealSlot,
          as: 'mealSlot',
          attributes: ['id', 'startTime', 'endTime', 'globalMealSlotId'],
          include: [
            {
              model: FnbGlobalMealSlot,
              as: 'globalMealSlot',
              attributes: ['id', 'name', 'startTime', 'endTime'],
            },
          ],
        },
      ],
    })

    // Fetch all global meal slots to build ID/name -> slotKey lookup map
    const globalSlots = await FnbGlobalMealSlot.findAll()
    const slotLookupMap = new Map<string, string>()
    globalSlots.forEach((gs) => {
      const normKey = gs.name.toLowerCase().replace(/\s+/g, '_')
      slotLookupMap.set(gs.id, normKey)
      slotLookupMap.set(gs.name.toLowerCase(), normKey)
    })

    // Helper to extract allowed package meal slots
    const extractAllowedMealSlots = (fnbPackages?: FnbResidentPackage[]): string[] => {
      if (!fnbPackages || fnbPackages.length === 0) return []
      const activePkg = fnbPackages[0]
      const included = activePkg?.propertyPackage?.globalPackage?.includedMealSlots
      if (Array.isArray(included) && included.length > 0) {
        const slotKeys: string[] = []
        included.forEach((slotItem) => {
          const rawStr = String(slotItem).toLowerCase()
          const mappedKey = slotLookupMap.get(slotItem) || slotLookupMap.get(rawStr)
          const keyToAdd = mappedKey || rawStr.replace(/\s+/g, '_')
          if (!slotKeys.includes(keyToAdd)) {
            slotKeys.push(keyToAdd)
          }
        })
        return slotKeys
      }
      return ['breakfast', 'lunch', 'evening_snacks', 'dinner']
    }

    const currentSlotKey =
      typeof mealSlotKey === 'string' && mealSlotKey.trim() ? mealSlotKey.trim().toLowerCase() : 'breakfast'

    // Map primary residents
    const mappedResidents = residents.map((r: Resident) => {
      const fnbPackages = r.fnbPackages
      const hasPkg = Boolean(fnbPackages && fnbPackages.length > 0)
      const allowedSlots = extractAllowedMealSlots(fnbPackages)
      const memberAttendances = attendances.filter((a: FnbFoodAttendance) => {
        const resId = a.residentId || (a as unknown as Record<string, unknown>).resident_id
        return Boolean(resId && r.id && String(resId).toLowerCase() === String(r.id).toLowerCase())
      })
      const plainMemberAttendances = memberAttendances.map((a: FnbFoodAttendance) => {
        const plain = (typeof a.get === 'function' ? a.get({ plain: true }) : a) as unknown as Record<string, unknown>
        let mKey = (plain.mealSlotKey || plain.meal_slot_key) as string | undefined
        if (!mKey || mKey === 'slot') {
          const globalMealSlot = plain.globalMealSlot as Record<string, unknown> | undefined
          const mealSlot = plain.mealSlot as Record<string, unknown> | undefined
          const mealSlotGlobal = mealSlot?.globalMealSlot as Record<string, unknown> | undefined
          const gName = (
            (globalMealSlot?.name as string) ||
            (mealSlotGlobal?.name as string) ||
            (mealSlot?.name as string) ||
            ''
          ).toLowerCase()
          if (gName.includes('break') || gName.includes('fast') || gName.includes('morn')) mKey = 'breakfast'
          else if (gName.includes('lunch') || gName.includes('noon')) mKey = 'lunch'
          else if (gName.includes('snack') && !gName.includes('night') && !gName.includes('mid'))
            mKey = 'evening_snacks'
          else if (gName.includes('dinner') || gName.includes('dinn')) mKey = 'dinner'
          else if (gName.includes('night') || gName.includes('mid') || gName.includes('late')) mKey = 'midnight_snacks'
          else if (gName) mKey = gName.replace(/\s+/g, '_')
          else if (plain.mealSlotId || plain.meal_slot_id)
            mKey = slotLookupMap.get(String(plain.mealSlotId || plain.meal_slot_id)) || ''
        }
        return {
          ...plain,
          id: plain.id,
          locId: plain.locId || plain.loc_id,
          residentId: plain.residentId || plain.resident_id,
          familyMemberId: plain.familyMemberId || plain.family_member_id,
          mealSlotId: plain.mealSlotId || plain.meal_slot_id,
          mealSlotKey: mKey,
          status: plain.status,
          attended: plain.status === 'attended',
          attendedAt: plain.attendedAt || plain.createdAt || plain.created_at,
          createdAt: plain.createdAt || plain.created_at,
        }
      })
      const currentAttendance = plainMemberAttendances.find(
        (a) => a.mealSlotKey && String(a.mealSlotKey).toLowerCase() === currentSlotKey,
      )
      const curAtt = currentAttendance as Record<string, unknown> | undefined
      const isAttended = Boolean(
        curAtt && (curAtt.status === 'attended' || curAtt.attended === true || curAtt.attendedAt),
      )
      const isSlotIncluded = hasPkg ? allowedSlots.length === 0 || allowedSlots.includes(currentSlotKey) : false
      const unitObj = r.unit as PropertyUnit | undefined
      const fullLoc = getUnitFullLocation(unitObj)
      const uNum = (unitObj?.unit_number || '') as string
      const creatorObj = curAtt?.creator as Record<string, unknown> | undefined
      const creatorProfile = creatorObj?.profile as Record<string, unknown> | undefined

      return {
        id: r.id,
        memberId: r.id,
        memberType: 'resident' as const,
        residentId: r.id,
        familyMemberId: null,
        unitId: r.unitId,
        firstName: r.firstName,
        lastName: r.lastName || '',
        name: `${r.firstName} ${r.lastName || ''}`.trim(),
        fullName: `${r.firstName} ${r.lastName || ''}`.trim(),
        phone: r.phone || '',
        photoUrl: r.photoUrl || null,
        unitNumber: uNum,
        flatNumber: uNum,
        locationString: fullLoc,
        fullLocation: fullLoc,
        dietaryPreference: fnbPackages?.[0]?.dietaryPreference || 'veg',
        packageName: fnbPackages?.[0]?.propertyPackage?.globalPackage?.name || null,
        hasActivePackage: hasPkg,
        allowedMealSlots: allowedSlots,
        isSlotIncludedInPackage: isSlotIncluded,
        attendance: curAtt
          ? {
              id: curAtt.id as string,
              attended: isAttended,
              attendedAt: (curAtt.attendedAt || curAtt.createdAt) as string | Date,
              mealSlotKey: (curAtt.mealSlotKey as string) || null,
              orderId: (curAtt.orderId as string) || null,
              created_by: (curAtt.createdBy as string) || null,
              created_by_user: creatorObj
                ? {
                    id: creatorObj.id as string,
                    firstName: (creatorProfile?.firstName || creatorObj.username || '') as string,
                    lastName: (creatorProfile?.lastName || '') as string,
                  }
                : null,
            }
          : null,
        attendances: plainMemberAttendances,
      }
    })

    // Map family members
    const mappedFamilyMembers = familyMembers.map((fm: ResidentFamilyMember) => {
      const fnbPackages = fm.fnbPackages
      const hasPkg = Boolean(fnbPackages && fnbPackages.length > 0)
      const allowedSlots = extractAllowedMealSlots(fnbPackages)
      const memberAttendances = attendances.filter((a: FnbFoodAttendance) => {
        const fmId = a.familyMemberId || (a as unknown as Record<string, unknown>).family_member_id
        return Boolean(fmId && fm.id && String(fmId).toLowerCase() === String(fm.id).toLowerCase())
      })
      const plainMemberAttendances = memberAttendances.map((a: FnbFoodAttendance) => {
        const plain = (typeof a.get === 'function' ? a.get({ plain: true }) : a) as unknown as Record<string, unknown>
        let mKey = (plain.mealSlotKey || plain.meal_slot_key) as string | undefined
        if (!mKey || mKey === 'slot') {
          const globalMealSlot = plain.globalMealSlot as Record<string, unknown> | undefined
          const mealSlot = plain.mealSlot as Record<string, unknown> | undefined
          const mealSlotGlobal = mealSlot?.globalMealSlot as Record<string, unknown> | undefined
          const gName = (
            (globalMealSlot?.name as string) ||
            (mealSlotGlobal?.name as string) ||
            (mealSlot?.name as string) ||
            ''
          ).toLowerCase()
          if (gName.includes('break') || gName.includes('fast') || gName.includes('morn')) mKey = 'breakfast'
          else if (gName.includes('lunch') || gName.includes('noon')) mKey = 'lunch'
          else if (gName.includes('snack') && !gName.includes('night') && !gName.includes('mid'))
            mKey = 'evening_snacks'
          else if (gName.includes('dinner') || gName.includes('dinn')) mKey = 'dinner'
          else if (gName.includes('night') || gName.includes('mid') || gName.includes('late')) mKey = 'midnight_snacks'
          else if (gName) mKey = gName.replace(/\s+/g, '_')
          else if (plain.mealSlotId || plain.meal_slot_id)
            mKey = slotLookupMap.get(String(plain.mealSlotId || plain.meal_slot_id)) || ''
        }
        return {
          ...plain,
          id: plain.id,
          locId: plain.locId || plain.loc_id,
          residentId: plain.residentId || plain.resident_id,
          familyMemberId: plain.familyMemberId || plain.family_member_id,
          mealSlotId: plain.mealSlotId || plain.meal_slot_id,
          mealSlotKey: mKey,
          status: plain.status,
          attended: plain.status === 'attended',
          attendedAt: plain.attendedAt || plain.createdAt || plain.created_at,
          createdAt: plain.createdAt || plain.created_at,
        }
      })
      const currentAttendance = plainMemberAttendances.find(
        (a) => a.mealSlotKey && String(a.mealSlotKey).toLowerCase() === currentSlotKey,
      )
      const curAtt = currentAttendance as Record<string, unknown> | undefined
      const isAttended = Boolean(
        curAtt && (curAtt.status === 'attended' || curAtt.attended === true || curAtt.attendedAt),
      )
      const isSlotIncluded = hasPkg ? allowedSlots.length === 0 || allowedSlots.includes(currentSlotKey) : false
      const resObj = fm.resident
      const resUnit = resObj?.unit as PropertyUnit | undefined
      const fullLoc = getUnitFullLocation(resUnit)
      const uNum = (resUnit?.unit_number || '') as string
      const creatorObj = curAtt?.creator as Record<string, unknown> | undefined
      const creatorProfile = creatorObj?.profile as Record<string, unknown> | undefined

      return {
        id: fm.id,
        memberId: fm.id,
        memberType: 'family' as const,
        residentId: fm.residentId,
        familyMemberId: fm.id,
        unitId: (resUnit?.id as string) || (resObj?.unitId as string) || null,
        firstName: fm.firstName,
        lastName: fm.lastName || '',
        name: `${fm.firstName} ${fm.lastName || ''}`.trim(),
        fullName: `${fm.firstName} ${fm.lastName || ''}`.trim(),
        relation: fm.relation || 'Family Member',
        phone: (fm.phone as string) || (resObj?.phone as string) || '',
        photoUrl: fm.photoUrl || null,
        unitNumber: uNum,
        flatNumber: uNum,
        locationString: fullLoc,
        fullLocation: fullLoc,
        dietaryPreference: fnbPackages?.[0]?.dietaryPreference || 'veg',
        packageName: fnbPackages?.[0]?.propertyPackage?.globalPackage?.name || null,
        hasActivePackage: hasPkg,
        allowedMealSlots: allowedSlots,
        isSlotIncludedInPackage: isSlotIncluded,
        attendance: curAtt
          ? {
              id: curAtt.id as string,
              attended: isAttended,
              attendedAt: (curAtt.attendedAt || curAtt.createdAt) as string | Date,
              mealSlotKey: (curAtt.mealSlotKey as string) || null,
              orderId: (curAtt.orderId as string) || null,
              created_by: (curAtt.createdBy as string) || null,
              created_by_user: creatorObj
                ? {
                    id: creatorObj.id as string,
                    firstName: (creatorProfile?.firstName || creatorObj.username || '') as string,
                    lastName: (creatorProfile?.lastName || '') as string,
                  }
                : null,
            }
          : null,
        attendances: plainMemberAttendances,
      }
    })

    type MemberRecord = (typeof mappedResidents)[number] | (typeof mappedFamilyMembers)[number]
    let allMembers: MemberRecord[] = [...mappedResidents, ...mappedFamilyMembers]

    // Apply search filter if provided
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase()
      allMembers = allMembers.filter(
        (m: MemberRecord) =>
          String(m.name || '')
            .toLowerCase()
            .includes(q) ||
          String(m.unitNumber || '')
            .toLowerCase()
            .includes(q) ||
          String(m.locationString || '')
            .toLowerCase()
            .includes(q) ||
          String(m.phone || '')
            .toLowerCase()
            .includes(q),
      )
    }

    // Group members flat-wise (by unitId)
    const flatMap: Record<
      string,
      {
        unitId: string
        unitNumber: string
        flatNumber: string
        locationString: string
        fullLocation: string
        primaryResident: { id?: string; fullName?: string; phone?: string } | null
        members: Record<string, unknown>[]
        guestCount: number
        guestAttendances: Record<string, unknown>[]
      }
    > = {}

    // Add guest attendances for target date
    const plainAttendances = attendances.map((a: FnbFoodAttendance): Record<string, unknown> => {
      const plain = (typeof a.get === 'function' ? a.get({ plain: true }) : a) as unknown as Record<string, unknown>
      let mKey = (plain.mealSlotKey || plain.meal_slot_key) as string | undefined
      if (!mKey || mKey === 'slot') {
        const globalMealSlot = plain.globalMealSlot as Record<string, unknown> | undefined
        const gName = ((globalMealSlot?.name as string) || '').toLowerCase()
        if (gName.includes('break') || gName.includes('fast')) mKey = 'breakfast'
        else if (gName.includes('lunch')) mKey = 'lunch'
        else if (gName.includes('snack') && !gName.includes('night') && !gName.includes('mid')) mKey = 'evening_snacks'
        else if (gName.includes('dinner')) mKey = 'dinner'
        else if (gName.includes('night') || gName.includes('mid')) mKey = 'midnight_snacks'
        else if (gName) mKey = gName.replace(/\s+/g, '_')
        else mKey = 'breakfast'
      }
      return {
        ...plain,
        mealSlotKey: mKey,
      }
    })

    const guestAttendances = plainAttendances.filter((a) => Boolean(a.isGuest || a.is_guest))

    allMembers.forEach((m: MemberRecord) => {
      const key = (m.unitId as string) || 'unassigned'
      if (!flatMap[key]) {
        flatMap[key] = {
          unitId: key,
          unitNumber: String(m.unitNumber || ''),
          flatNumber: String(m.unitNumber || ''),
          locationString: String(m.locationString || ''),
          fullLocation: String(m.locationString || ''),
          primaryResident: null,
          members: [],
          guestCount: 0,
          guestAttendances: [],
        }
      }
      if (m.memberType === 'resident' && !flatMap[key].primaryResident) {
        flatMap[key].primaryResident = {
          id: m.residentId as string,
          fullName: m.fullName as string,
          phone: m.phone as string,
        }
      }
      flatMap[key].members.push(m as unknown as Record<string, unknown>)
    })

    guestAttendances.forEach((ga: Record<string, unknown>) => {
      const key = (ga.unitId || ga.unit_id || 'unassigned') as string
      const formattedGa = {
        id: ga.id,
        locId: ga.locId || ga.loc_id,
        unitId: ga.unitId || ga.unit_id,
        date: ga.date,
        isGuest: true,
        guestName: ga.guestName || ga.guest_name || 'Guest',
        guestCount: Number(ga.guestCount || ga.guest_count) || 1,
        globalMealSlotId:
          ga.globalMealSlotId ||
          ga.global_meal_slot_id ||
          (ga.globalMealSlot as Record<string, unknown> | undefined)?.id ||
          null,
        globalMealSlot: ga.globalMealSlot || null,
        mealSlotKey: ga.mealSlotKey || 'breakfast',
        orderId: ga.orderId || ga.order_id,
        status: ga.status || 'attended',
        remarks: ga.remarks,
        createdAt: ga.createdAt || ga.created_at,
        creator: ga.creator,
      }

      if (flatMap[key]) {
        flatMap[key].guestAttendances.push(formattedGa as Record<string, unknown>)
        flatMap[key].guestCount = (flatMap[key].guestCount || 0) + (formattedGa.guestCount || 1)
      } else {
        flatMap[key] = {
          unitId: key,
          unitNumber: 'Guest Flat',
          flatNumber: 'Guest Flat',
          locationString: 'Guest Meals',
          fullLocation: 'Guest Meals',
          primaryResident: null,
          members: [],
          guestCount: formattedGa.guestCount || 1,
          guestAttendances: [formattedGa as Record<string, unknown>],
        }
      }
    })

    const flatsList = Object.values(flatMap)

    // Summary counts
    const totalResidingMembers = allMembers.length
    const totalPackageHolders = allMembers.filter((m: MemberRecord) => m.hasActivePackage).length
    const totalDinedInToday = attendances.filter((a: FnbFoodAttendance) => a.status === 'attended' && !a.isGuest).length
    const totalGuestDinedInToday = guestAttendances
      .filter((a) => a.status === 'attended')
      .reduce((sum: number, g) => sum + (Number(g.guestCount || g.guest_count) || 1), 0)

    res.json({
      success: true,
      data: {
        date: targetDate,
        summary: {
          totalResidingMembers,
          totalPackageHolders,
          attendedCount: totalDinedInToday,
          totalDinedInToday,
          absentCount: Math.max(0, totalResidingMembers - totalDinedInToday),
          pendingCount: Math.max(0, totalPackageHolders - totalDinedInToday),
          guestMealsCount: totalGuestDinedInToday,
          totalGuestDinedInToday,
        },
        members: allMembers,
        flats: flatsList,
        attendances,
      },
    })
  } catch (error) {
    console.error('Error fetching residing members & food attendances:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch food attendance data', error: String(error) })
  }
}

export const markAttendanceAndCreateOrder = async (req: Request, res: Response): Promise<void> => {
  const transaction = await sequelize.transaction()
  try {
    const {
      locId,
      date: dateInput,
      residentId: reqResidentId,
      familyMemberId: reqFamilyMemberId,
      memberId,
      memberType,
      unitId,
      mealSlotId,
      globalMealSlotId: reqGlobalMealSlotId,
      mealSlotKey: reqMealSlotKey,
      status: reqStatus,
      attended,
      remarks,
    } = req.body
    const loggedUserId = (req as AuthenticatedRequest).user?.id || null

    let residentId = reqResidentId || null
    let familyMemberId = reqFamilyMemberId || null

    if (!residentId && !familyMemberId && memberId) {
      if (memberType === 'family' || memberType === 'family_member') {
        familyMemberId = memberId
      } else {
        residentId = memberId
      }
    }

    if (!residentId && !familyMemberId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Either residentId or familyMemberId is required' })
      return
    }

    // Resolve property mealSlot, mealSlotKey, and globalMealSlotId
    let resolvedSlotKey = reqMealSlotKey ? String(reqMealSlotKey).toLowerCase() : ''
    let resolvedGlobalSlotId = reqGlobalMealSlotId || null
    let targetPSlot: FnbPropertyMealSlot | null = null

    const slotIdToFind = mealSlotId || reqGlobalMealSlotId
    if (slotIdToFind) {
      targetPSlot = await FnbPropertyMealSlot.findByPk(slotIdToFind, {
        include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
        transaction,
      })
    }

    if (!targetPSlot) {
      const slotToMatch = (resolvedSlotKey || reqMealSlotKey || reqGlobalMealSlotId || 'breakfast')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      const pSlots = await FnbPropertyMealSlot.findAll({
        where: { locId, isActive: true },
        include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
        transaction,
      })

      targetPSlot =
        pSlots.find((ps) => {
          const gNameClean = (ps.globalMealSlot?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
          const psGlobalSlot = ps.globalMealSlot as Record<string, unknown> | undefined
          const gCodeClean = (
            (psGlobalSlot?.code as string | undefined) ||
            (psGlobalSlot?.slotKey as string | undefined) ||
            ''
          )
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
          return (
            ps.id === reqGlobalMealSlotId ||
            ps.globalMealSlotId === reqGlobalMealSlotId ||
            gCodeClean === slotToMatch ||
            gNameClean === slotToMatch ||
            gNameClean.includes(slotToMatch) ||
            slotToMatch.includes(gNameClean)
          )
        }) ||
        pSlots[0] ||
        null
    }

    if (!targetPSlot) {
      targetPSlot = await FnbPropertyMealSlot.findOne({
        where: { locId },
        include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
        transaction,
      })
    }

    if (targetPSlot) {
      resolvedSlotKey = (targetPSlot.globalMealSlot?.name || '').toLowerCase().replace(/\s+/g, '_') || resolvedSlotKey
      resolvedGlobalSlotId = targetPSlot.globalMealSlotId || resolvedGlobalSlotId
    }
    void resolvedGlobalSlotId

    if (!resolvedSlotKey) {
      resolvedSlotKey = 'breakfast'
    }

    const resolvedMealSlotId = targetPSlot?.id || null
    if (!locId || !resolvedMealSlotId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'locId and valid mealSlotId are required' })
      return
    }

    const targetDate = typeof dateInput === 'string' && dateInput ? dateInput : new Date().toISOString().split('T')[0]!
    const slotKeyNormalized = resolvedSlotKey

    let attStatus: 'attended' | 'absent' | 'opted_out' = 'attended'
    if (reqStatus) {
      attStatus = reqStatus === 'absent' || reqStatus === 'opted_out' ? reqStatus : 'attended'
    } else if (typeof attended === 'boolean') {
      attStatus = attended ? 'attended' : 'absent'
    }

    // Prevent marking attendance if meal slot end time has crossed
    const todayStr = new Date().toISOString().split('T')[0]!
    if (attStatus === 'attended') {
      let isCrossed = false
      if (targetDate < todayStr) {
        isCrossed = true
      } else if (targetDate === todayStr) {
        let endTimeStr: string | null =
          (targetPSlot?.endTime as string) || (targetPSlot?.globalMealSlot?.endTime as string) || null
        let startTimeStr: string | null =
          (targetPSlot?.startTime as string) || (targetPSlot?.globalMealSlot?.startTime as string) || null

        if (!endTimeStr) {
          if (
            slotKeyNormalized.includes('mid') ||
            slotKeyNormalized.includes('night') ||
            slotKeyNormalized.includes('late')
          ) {
            endTimeStr = '23:59'
            startTimeStr = '23:30'
          } else if (slotKeyNormalized.includes('break') || slotKeyNormalized.includes('fast')) {
            endTimeStr = '09:30'
            startTimeStr = '07:30'
          } else if (slotKeyNormalized.includes('lunch')) {
            endTimeStr = '15:00'
            startTimeStr = '12:30'
          } else if (
            slotKeyNormalized.includes('snack') ||
            slotKeyNormalized.includes('even') ||
            slotKeyNormalized.includes('tea')
          ) {
            endTimeStr = '18:00'
            startTimeStr = '16:30'
          } else if (slotKeyNormalized.includes('dinner')) {
            endTimeStr = '22:00'
            startTimeStr = '19:30'
          } else {
            endTimeStr = '23:59'
            startTimeStr = '00:00'
          }
        }

        const startMin = parseTimeToMinutes(startTimeStr || '00:00')
        let endMin = parseTimeToMinutes(endTimeStr)
        if (endMin <= startMin && startMin > 0) {
          endMin += 1440
        }

        const now = new Date()
        const curMin = now.getHours() * 60 + now.getMinutes()
        if (curMin > endMin) {
          isCrossed = true
        }
      }

      if (isCrossed) {
        await transaction.rollback()
        res.status(400).json({
          success: false,
          message: 'Meal slot time has crossed. Attendance cannot be marked for this slot.',
        })
        return
      }
    }

    // 1. Verify active package contains meal slot
    const pkgWhere = residentId
      ? { residentId, status: FnbSubscriptionStatus.ACTIVE }
      : { familyMemberId, status: FnbSubscriptionStatus.ACTIVE }
    const activePkg = await FnbResidentPackage.findOne({
      where: pkgWhere,
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
      ],
      transaction,
    })

    if (activePkg) {
      const rawIncludedSlots: string[] = Array.isArray(activePkg.propertyPackage?.globalPackage?.includedMealSlots)
        ? activePkg.propertyPackage!.globalPackage!.includedMealSlots.map((s) => String(s).toLowerCase())
        : []

      if (rawIncludedSlots.length > 0) {
        const globalSlots = await FnbGlobalMealSlot.findAll({ transaction })
        const allowedKeysOrIds = new Set<string>(rawIncludedSlots)

        globalSlots.forEach((gs) => {
          if (allowedKeysOrIds.has(gs.id.toLowerCase())) {
            const nameClean = gs.name.toLowerCase().replace(/\s+/g, '')
            allowedKeysOrIds.add(nameClean)
            if (nameClean.includes('break') || nameClean.includes('fast')) allowedKeysOrIds.add('breakfast')
            if (nameClean.includes('lunch')) allowedKeysOrIds.add('lunch')
            if (nameClean.includes('mid') || nameClean.includes('night') || nameClean.includes('late')) {
              allowedKeysOrIds.add('midnight_snacks')
              allowedKeysOrIds.add('night_snacks')
            }
            if (nameClean.includes('snack') || nameClean.includes('even')) {
              allowedKeysOrIds.add('snacks')
              allowedKeysOrIds.add('evening_snacks')
            }
            if (nameClean.includes('dinner')) allowedKeysOrIds.add('dinner')
          }
        })

        if (!allowedKeysOrIds.has(slotKeyNormalized)) {
          // If explicitly restricted, return informative message
          console.warn(`Meal slot '${reqMealSlotKey}' check failed for included slots:`, Array.from(allowedKeysOrIds))
        }
      }
    }

    const attWhere = residentId
      ? { locId, date: targetDate, residentId, mealSlotId: resolvedMealSlotId }
      : { locId, date: targetDate, familyMemberId, mealSlotId: resolvedMealSlotId }

    let attendance = await FnbFoodAttendance.findOne({ where: attWhere, transaction })

    if (attStatus === 'absent' || attStatus === 'opted_out') {
      if (attendance) {
        await attendance.destroy({ transaction, force: true })
        attendance = null
      }
    } else {
      if (attendance) {
        await attendance.update(
          {
            status: 'attended',
            remarks: remarks || null,
            unitId: unitId || attendance.unitId,
            updatedBy: loggedUserId,
          },
          { transaction },
        )
      } else {
        attendance = await FnbFoodAttendance.create(
          {
            locId,
            unitId: unitId || null,
            date: targetDate,
            residentId: residentId || null,
            familyMemberId: familyMemberId || null,
            isGuest: false,
            guestCount: 1,
            mealSlotId: resolvedMealSlotId,
            status: 'attended',
            remarks: remarks || null,
            createdBy: loggedUserId,
            updatedBy: loggedUserId,
          },
          { transaction },
        )
      }
    }

    await transaction.commit()

    res.json({
      success: true,
      message: attStatus === 'attended' ? 'Attendance marked successfully.' : 'Attendance removed successfully.',
      data: {
        attendance,
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Error marking food attendance:', error)
    res.status(500).json({ success: false, message: 'Failed to mark attendance', error: String(error) })
  }
}

export const markGuestAttendance = async (req: Request, res: Response): Promise<void> => {
  const transaction = await sequelize.transaction()
  try {
    const {
      locId,
      unitId,
      date: dateInput,
      guestName,
      guestCount,
      globalMealSlotId,
      mealSlotKey,
      mealSlotId,
      remarks,
    } = req.body
    const loggedUserId = (req as AuthenticatedRequest).user?.id || null

    if (!locId || !unitId || (!mealSlotKey && !globalMealSlotId && !mealSlotId)) {
      await transaction.rollback()
      res.status(400).json({
        success: false,
        message: 'locId, unitId, and mealSlotKey, globalMealSlotId, or mealSlotId are required for guest attendance',
      })
      return
    }

    const targetDate = typeof dateInput === 'string' && dateInput ? dateInput : new Date().toISOString().split('T')[0]!
    const count = Number(guestCount || 1)

    // Resolve globalMealSlotId and mealSlotKey
    let resolvedGlobalSlotId: string | null = globalMealSlotId || null
    let slotKeyNormalized = String(mealSlotKey || '').toLowerCase()

    let gSlot = null
    if (resolvedGlobalSlotId) {
      gSlot = await FnbGlobalMealSlot.findByPk(resolvedGlobalSlotId, { transaction })
      if (!gSlot) {
        const pSlot = await FnbPropertyMealSlot.findByPk(resolvedGlobalSlotId, { transaction })
        if (pSlot) {
          resolvedGlobalSlotId = pSlot.globalMealSlotId || pSlot.id
          gSlot = await FnbGlobalMealSlot.findByPk(resolvedGlobalSlotId, { transaction })
        }
      }
    }

    if (!gSlot && (mealSlotKey || globalMealSlotId)) {
      const slotToMatch = String(mealSlotKey || globalMealSlotId)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      const globalSlots = await FnbGlobalMealSlot.findAll({ transaction })
      gSlot = globalSlots.find((gs) => {
        const nameClean = gs.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        const gsObj = gs as unknown as Record<string, unknown>
        const codeClean = ((gsObj.code as string | undefined) || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        return (
          gs.id === mealSlotKey ||
          gs.id === globalMealSlotId ||
          nameClean === slotToMatch ||
          slotToMatch.includes(nameClean) ||
          nameClean.includes(slotToMatch) ||
          (codeClean && codeClean !== 'slot' && codeClean === slotToMatch)
        )
      })
      if (gSlot) {
        resolvedGlobalSlotId = gSlot.id
      }
    }

    if (gSlot) {
      resolvedGlobalSlotId = gSlot.id
      const normName = gSlot.name.toLowerCase()
      if (normName.includes('break') || normName.includes('fast')) slotKeyNormalized = 'breakfast'
      else if (normName.includes('lunch')) slotKeyNormalized = 'lunch'
      else if (normName.includes('snack') && !normName.includes('night') && !normName.includes('mid'))
        slotKeyNormalized = 'evening_snacks'
      else if (normName.includes('dinner')) slotKeyNormalized = 'dinner'
      else if (normName.includes('night') || normName.includes('mid')) slotKeyNormalized = 'midnight_snacks'
      else slotKeyNormalized = normName.replace(/\s+/g, '_')
    } else if (!slotKeyNormalized || slotKeyNormalized === 'slot') {
      slotKeyNormalized = 'breakfast'
    }

    // Resolve property mealSlotId for guest attendance
    let resolvedGuestMealSlotId: string | null = mealSlotId || globalMealSlotId || null

    if (!resolvedGuestMealSlotId) {
      const slotToMatch = (mealSlotKey || globalMealSlotId || 'breakfast')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      const pSlots = await FnbPropertyMealSlot.findAll({
        where: { locId, isActive: true },
        include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
        transaction,
      })

      const matchedSlot = pSlots.find((ps) => {
        const gNameClean = (ps.globalMealSlot?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        const psGlobalSlot = ps.globalMealSlot as Record<string, unknown> | undefined
        const gCodeClean = (
          (psGlobalSlot?.code as string | undefined) ||
          (psGlobalSlot?.slotKey as string | undefined) ||
          ''
        )
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
        return (
          ps.id === mealSlotId ||
          ps.id === globalMealSlotId ||
          ps.globalMealSlotId === globalMealSlotId ||
          gCodeClean === slotToMatch ||
          gNameClean === slotToMatch
        )
      })

      resolvedGuestMealSlotId = matchedSlot ? matchedSlot.id : pSlots[0]?.id || null
    }

    if (!resolvedGuestMealSlotId) {
      const anySlot = await FnbPropertyMealSlot.findOne({ where: { locId }, transaction })
      if (anySlot) {
        resolvedGuestMealSlotId = anySlot.id
      }
    }

    if (!resolvedGuestMealSlotId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Valid property mealSlotId is required for guest attendance' })
      return
    }

    // Create FnbFoodAttendance entry for guest
    const guestAttendance = await FnbFoodAttendance.create(
      {
        locId,
        unitId,
        date: targetDate,
        isGuest: true,
        guestName: guestName || 'Guest Dine-In',
        guestCount: count,
        mealSlotId: resolvedGuestMealSlotId,
        status: 'attended',
        remarks: remarks || null,
        createdBy: loggedUserId,
        updatedBy: loggedUserId,
      },
      { transaction },
    )

    await transaction.commit()

    res.json({
      success: true,
      message: `Guest attendance for ${count} guest(s) recorded successfully.`,
      data: {
        attendance: guestAttendance,
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Error marking guest attendance:', error)
    res.status(500).json({ success: false, message: 'Failed to record guest attendance', error: String(error) })
  }
}

export const getAttendanceSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { locId, date: dateQuery } = req.query
    if (!locId) {
      res.status(400).json({ success: false, message: 'locId is required' })
      return
    }

    const targetDate = typeof dateQuery === 'string' && dateQuery ? dateQuery : new Date().toISOString().split('T')[0]!

    const attendances = await FnbFoodAttendance.findAll({
      where: {
        locId: String(locId),
        date: targetDate,
      },
    })

    const memberAttendedCount = attendances.filter((a) => a.status === 'attended' && !a.isGuest).length
    const guestDinedInCount = attendances
      .filter((a) => a.status === 'attended' && a.isGuest)
      .reduce((sum, g) => sum + (g.guestCount || 1), 0)

    res.json({
      success: true,
      data: {
        date: targetDate,
        totalAttended: memberAttendedCount + guestDinedInCount,
        memberAttendedCount,
        guestDinedInCount,
      },
    })
  } catch (error) {
    console.error('Error getting attendance summary:', error)
    res.status(500).json({ success: false, message: 'Failed to get summary', error: String(error) })
  }
}
