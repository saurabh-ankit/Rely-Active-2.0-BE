import type { Request, Response } from 'express'
import {
  FnbGlobalPackage,
  FnbPropertyPackage,
  FnbResidentPackage,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
} from '../../../models/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { FnbSubscriptionStatus } from '../../../enums/fnb.enum.js'

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
