import type { Request, Response } from 'express'
import { Op } from 'sequelize'
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
import { FnbDietaryType, FnbSubscriptionStatus } from '../../../enums/fnb.enum.js'

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
