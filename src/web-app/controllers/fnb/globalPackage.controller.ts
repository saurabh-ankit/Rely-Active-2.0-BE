import type { Request, Response } from 'express'
import {
  FnbGlobalPackage,
  FnbPropertyPackage,
  FnbResidentPackage,
  Property,
  FnbGlobalMealSlot,
  FnbPropertyMealSlot,
} from '../../../models/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'

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
