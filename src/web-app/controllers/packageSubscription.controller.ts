import type { Request, Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { Op } from 'sequelize'
import sequelize from '../../config/db/index.js'
import {
  PackageSubscription,
  PackageSubscriptionFeature,
  Package,
  CareTask,
  CarePackageFeaturesMap,
  Resident,
  PropertyUnit,
  AdditionalTaskCharge,
  User,
  UserDetail,
  CareTaskAssignment,
} from '../../models/index.js'
import { SubscriptionStatus } from '../../enums/packageSubscription.enum.js'
import { syncPackageTasksForResidents } from './careTaskAssignment.controller.js'

export const getAllPackageSubscriptions = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locId = (req.params.locationId ||
      req.params.locId ||
      req.query.locId ||
      req.query.locationId ||
      req.query.propertyId) as string | undefined
    const { status, residentId, search } = req.query

    const whereClause: Record<string, unknown> = {
      isDeleted: false,
    }

    if (locId && locId !== 'all') {
      whereClause.propertyId = locId
    }

    if (status) {
      whereClause.status = status
    }

    if (residentId) {
      whereClause.residentId = residentId
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Fetch all subscriptions with related Resident, CarePackage, and Unit
    const subscriptions = await PackageSubscription.findAll({
      where: whereClause,
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: [
            'id',
            'firstName',
            'lastName',
            'username',
            'gender',
            'dob',
            'phone',
            'email',
            'unitId',
            'locId',
            'status',
            'carePackageId',
          ],
          required: false,
          include: [
            {
              model: PropertyUnit,
              as: 'unit',
              attributes: ['id', 'unit_number', 'unit_type'],
              required: false,
            },
          ],
        },
        {
          model: Package,
          as: 'carePackage',
          attributes: ['id', 'packageName', 'description', 'packageCost', 'duration', 'isActive'],
          required: false,
          include: [
            {
              model: CarePackageFeaturesMap,
              as: 'featureMappings',
              required: false,
              where: { isDeleted: false },
              include: [
                {
                  model: CareTask,
                  as: 'feature',
                  attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price'],
                  required: false,
                },
              ],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    const subscriptionIds = subscriptions.map((s) => s.id)
    const residentIds = Array.from(new Set(subscriptions.map((s) => s.residentId).filter(Boolean)))

    // Fetch Subscription Features
    const subscriptionFeatures =
      subscriptionIds.length > 0
        ? await PackageSubscriptionFeature.findAll({
            where: {
              packageSubscriptionId: { [Op.in]: subscriptionIds },
              isDeleted: false,
            },
            include: [
              {
                model: CareTask,
                as: 'feature',
                attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price'],
                required: false,
              },
            ],
          })
        : []

    // Group features by subscriptionId
    const featuresBySubscription = subscriptionFeatures.reduce(
      (acc, sf) => {
        const subId = sf.packageSubscriptionId
        if (!acc[subId]) acc[subId] = []
        acc[subId].push(sf)
        return acc
      },
      {} as Record<string, typeof subscriptionFeatures>,
    )

    // Fetch Additional Task Charges
    const additionalTasks =
      residentIds.length > 0
        ? await AdditionalTaskCharge.findAll({
            where: {
              residentId: { [Op.in]: residentIds },
              price: { [Op.gt]: 0 },
              isDeleted: false,
            },
            include: [
              {
                model: User,
                as: 'nurse',
                attributes: ['id', 'username'],
                include: [
                  {
                    model: UserDetail,
                    as: 'profile',
                    attributes: ['firstName', 'lastName'],
                    required: false,
                  },
                ],
                required: false,
              },
            ],
            order: [['completedAt', 'DESC']],
          })
        : []

    // Group additional tasks by residentId
    const additionalTasksByResident = additionalTasks.reduce(
      (acc, task) => {
        const rid = task.residentId
        if (!acc[rid]) acc[rid] = []
        acc[rid].push(task)
        return acc
      },
      {} as Record<string, typeof additionalTasks>,
    )

    // Map subscriptions with calculations
    const subscriptionsWithCalculations = subscriptions.map((sub) => {
      const subData = (sub.toJSON ? sub.toJSON() : sub) as unknown as Record<string, unknown> & {
        resident?: Resident & { unit?: PropertyUnit }
        carePackage?: Package & { featureMappings?: CarePackageFeaturesMap[] }
      }
      const subFeatures = featuresBySubscription[sub.id] || []

      // Features list with complimentary and remaining counts
      const features = subFeatures.map((sf) => ({
        id: sf.featureId,
        name: sf.feature?.careTaskName || 'Task',
        description: sf.feature?.careTaskDescription || null,
        billingType: sf.feature?.billingType || 'MONTHLY',
        price: Number(sf.feature?.price ?? 0),
        complimentaryCount: Number(sf.complimentaryCount || 0),
        remainingCount: Number(sf.remainingCount || 0),
      }))

      // Package features from package featureMappings
      const packageFeatures = (subData.carePackage?.featureMappings || []).map((fm) => ({
        id: fm.featureId,
        name: fm.feature?.careTaskName || 'Task',
        description: fm.feature?.careTaskDescription || null,
        billingType: fm.feature?.billingType || 'MONTHLY',
        price: Number(fm.feature?.price ?? 0),
        complimentaryCount: Number(fm.complimentaryCount || 0),
        remainingCount: Number(fm.complimentaryCount || 0),
      }))

      // Resident display info
      const residentObj = subData.resident
      const firstName = residentObj?.firstName || ''
      const lastName = residentObj?.lastName || ''
      const fullName = `${firstName} ${lastName}`.trim() || residentObj?.username || 'Resident'
      const unitNumber = residentObj?.unit?.unit_number ? `Flat ${residentObj.unit.unit_number}` : ''
      const residentNumber = unitNumber || residentObj?.username || residentObj?.id?.substring(0, 8) || 'N/A'

      const residentFormatted = residentObj
        ? {
            ...residentObj,
            fullName,
            patientNumber: residentNumber,
            unitNumber,
          }
        : null

      // Care Package display info (compat with FE types)
      const carePackageFormatted = subData.carePackage
        ? {
            id: subData.carePackage.id,
            name: subData.carePackage.packageName,
            packageName: subData.carePackage.packageName,
            description: subData.carePackage.description,
            cost: Number(subData.carePackage.packageCost || 0),
            packageCost: Number(subData.carePackage.packageCost || 0),
            duration: subData.carePackage.duration,
            durationType: subData.carePackage.duration === 'Yearly' ? 'yearly' : 'monthly',
            durationValue: subData.carePackage.duration === 'Yearly' ? 365 : 30,
          }
        : null

      // Days utilized & costed calculation
      const startDate = new Date(sub.startDate)
      startDate.setHours(0, 0, 0, 0)

      const isActive = sub.status === SubscriptionStatus.ACTIVE
      let endDateCalc: Date
      if (isActive && !sub.endDate) {
        endDateCalc = new Date(today)
      } else if (sub.endDate) {
        endDateCalc = new Date(sub.endDate)
        endDateCalc.setHours(0, 0, 0, 0)
      } else {
        endDateCalc = new Date(today)
      }

      const diffTime = endDateCalc.getTime() - startDate.getTime()
      const daysUtilized = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1)

      const packageCost = Number(subData.carePackage?.packageCost || sub.totalCost || 0)
      const durationValue = subData.carePackage?.duration === 'Yearly' ? 365 : 30
      const costed =
        packageCost > 0 && durationValue > 0 ? Number(((daysUtilized * packageCost) / durationValue).toFixed(2)) : 0

      // Additional tasks for this resident
      const resAdditionalTasks = (additionalTasksByResident[sub.residentId] || []).map((task) => {
        const nurseObj = task.nurse as (User & { profile?: UserDetail }) | undefined
        const nurseName = nurseObj?.profile?.firstName
          ? `${nurseObj.profile.firstName} ${nurseObj.profile.lastName || ''}`.trim()
          : nurseObj?.username || null
        return {
          id: task.id,
          taskName: task.taskName,
          description: task.description,
          price: Number(task.price || 0),
          unitPrice:
            task.unitPrice !== null && task.unitPrice !== undefined ? Number(task.unitPrice) : Number(task.price || 0),
          completedAt: task.completedAt,
          nurseName,
        }
      })

      return {
        ...subData,
        resident: residentFormatted,
        patient: residentFormatted, // compatibility alias
        carePackage: carePackageFormatted,
        daysUtilized,
        costed,
        features: features.length > 0 ? features : packageFeatures,
        packageFeatures,
        additionalTasks: resAdditionalTasks,
      }
    })

    // Filter by search query if present
    let finalResult = subscriptionsWithCalculations
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const q = search.toLowerCase().trim()
      finalResult = subscriptionsWithCalculations.filter((s) => {
        const name = (s.resident?.fullName || '').toLowerCase()
        const num = (s.resident?.patientNumber || '').toLowerCase()
        const pkg = (s.carePackage?.name || '').toLowerCase()
        return name.includes(q) || num.includes(q) || pkg.includes(q)
      })
    }

    res.status(200).json({
      success: true,
      data: finalResult,
      total: finalResult.length,
    })
  } catch (error) {
    console.error('[GET ALL PACKAGE SUBSCRIPTIONS ERROR]:', error)
    next(error)
  }
}

export const getPackageSubscriptionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params
    const subscription = await PackageSubscription.findOne({
      where: { id, isDeleted: false },
      include: [
        {
          model: Resident,
          as: 'resident',
          include: [{ model: PropertyUnit, as: 'unit' }],
        },
        {
          model: Package,
          as: 'carePackage',
          include: [
            {
              model: CarePackageFeaturesMap,
              as: 'featureMappings',
              include: [{ model: CareTask, as: 'feature' }],
            },
          ],
        },
        {
          model: PackageSubscriptionFeature,
          as: 'packageSubscriptionFeatures',
          where: { isDeleted: false },
          required: false,
          include: [{ model: CareTask, as: 'feature' }],
        },
      ],
    })

    if (!subscription) {
      res.status(404).json({ success: false, message: 'Package subscription not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: subscription,
    })
  } catch (error) {
    console.error('[GET PACKAGE SUBSCRIPTION BY ID ERROR]:', error)
    next(error)
  }
}

export const changePackage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const transaction = await sequelize.transaction()
  try {
    const id = String(req.params.id)
    const { newCarePackageId, startDate, endDate, taskSchedules } = req.body
    const operatorId = req.user?.id || 'system'
    const stoppedByUserId = req.user?.id || null

    if (!newCarePackageId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'New care package ID is required' })
      return
    }

    // Find current active subscription
    const currentSubscription = await PackageSubscription.findOne({
      where: { id, isDeleted: false, status: SubscriptionStatus.ACTIVE },
      transaction,
    })

    if (!currentSubscription) {
      await transaction.rollback()
      res.status(404).json({ success: false, message: 'Active package subscription not found' })
      return
    }

    const { residentId, carePackageId: oldPackageId, propertyId } = currentSubscription

    // Find current and new package
    const oldPackage = await Package.findByPk(oldPackageId, { transaction })
    const newPackage = await Package.findOne({
      where: { id: newCarePackageId, isDeleted: false, isActive: true },
      transaction,
    })

    if (!newPackage) {
      await transaction.rollback()
      res.status(404).json({ success: false, message: 'New care package not found or inactive' })
      return
    }

    const newStartDate = startDate ? new Date(startDate) : new Date()

    // Ensure all other active subscriptions for this resident are marked inactive
    await PackageSubscription.update(
      {
        status: SubscriptionStatus.INACTIVE,
        endDate: newStartDate,
        updatedBy: operatorId,
      },
      {
        where: {
          residentId,
          status: SubscriptionStatus.ACTIVE,
          isDeleted: false,
          id: { [Op.ne]: id },
        },
        transaction,
      },
    )

    // Mark current subscription as inactive, isPrevious = true
    await currentSubscription.update(
      {
        endDate: newStartDate,
        status: SubscriptionStatus.INACTIVE,
        isPrevious: true,
        updatedBy: operatorId,
      },
      { transaction },
    )

    // Soft delete features from previous subscription
    await PackageSubscriptionFeature.update(
      {
        isDeleted: true,
        updatedBy: operatorId,
      },
      {
        where: {
          packageSubscriptionId: currentSubscription.id,
          isDeleted: false,
        },
        transaction,
      },
    )

    // Cancel & soft delete all previous package care task assignments for this resident
    await CareTaskAssignment.update(
      {
        status: 'CANCELLED',
        isStopped: true,
        stoppedAt: new Date(),
        stoppedBy: stoppedByUserId,
        isActive: false,
        isDeleted: true,
        updatedBy: operatorId,
      },
      {
        where: {
          residentId,
          source: 'PACKAGE',
          isDeleted: false,
        },
        transaction,
      },
    )

    // Create new active subscription
    const newSubscription = await PackageSubscription.create(
      {
        residentId,
        carePackageId: newCarePackageId,
        propertyId,
        startDate: newStartDate,
        endDate: endDate ? new Date(endDate) : null,
        totalCost: newPackage.packageCost,
        status: SubscriptionStatus.ACTIVE,
        isPrevious: false,
        notes: `Changed from package: ${oldPackage?.packageName || oldPackageId}`,
        createdBy: operatorId,
        updatedBy: operatorId,
      },
      { transaction },
    )

    // Seed new features from new package's CarePackageFeaturesMap
    const featureMappings = await CarePackageFeaturesMap.findAll({
      where: { carePackageId: newCarePackageId, isDeleted: false },
      transaction,
    })

    if (featureMappings.length > 0) {
      const featuresToCreate = featureMappings.map((fm) => ({
        packageSubscriptionId: newSubscription.id,
        featureId: fm.featureId,
        complimentaryCount: Number(fm.complimentaryCount || 0),
        remainingCount: Number(fm.complimentaryCount || 0),
        createdBy: operatorId,
        updatedBy: operatorId,
      }))
      await PackageSubscriptionFeature.bulkCreate(featuresToCreate, { transaction })
    }

    // Update resident's current carePackageId
    await Resident.update(
      { carePackageId: newCarePackageId, updatedBy: operatorId },
      { where: { id: residentId }, transaction },
    )

    await transaction.commit()
    await syncPackageTasksForResidents(residentId, newSubscription.propertyId, taskSchedules)

    // Fetch updated record with relations
    const updatedRecord = await PackageSubscription.findByPk(newSubscription.id, {
      include: [
        { model: Resident, as: 'resident' },
        { model: Package, as: 'carePackage' },
        { model: PackageSubscriptionFeature, as: 'packageSubscriptionFeatures' },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Package changed successfully',
      data: {
        newSubscription: updatedRecord,
        previousSubscriptionId: currentSubscription.id,
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('[CHANGE PACKAGE ERROR]:', error)
    next(error)
  }
}

export const updateSubscriptionStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = String(req.params.id)
    const { status, endDate, notes } = req.body
    const operatorId = req.user?.id || 'system'
    const stoppedByUserId = req.user?.id || null

    const subscription = await PackageSubscription.findByPk(id)
    if (!subscription) {
      res.status(404).json({ success: false, message: 'Package subscription not found' })
      return
    }

    const newStatus = status as SubscriptionStatus
    const effectiveEndDate = endDate
      ? new Date(endDate)
      : newStatus === SubscriptionStatus.INACTIVE || newStatus === SubscriptionStatus.CANCELLED
        ? new Date()
        : subscription.endDate

    // If resuming (setting to ACTIVE), ensure no other active subscription exists for resident
    if (newStatus === SubscriptionStatus.ACTIVE && subscription.status !== SubscriptionStatus.ACTIVE) {
      const existingActive = await PackageSubscription.findOne({
        where: {
          residentId: subscription.residentId,
          status: SubscriptionStatus.ACTIVE,
          isDeleted: false,
          id: { [Op.ne]: id },
        },
      })
      if (existingActive) {
        res.status(400).json({
          success: false,
          message:
            'Resident already has an active package subscription. Please stop it first before resuming this one.',
        })
        return
      }

      // Sync resident's current carePackageId
      await Resident.update(
        { carePackageId: subscription.carePackageId, updatedBy: operatorId },
        { where: { id: subscription.residentId } },
      )
    }

    await subscription.update({
      status: newStatus || subscription.status,
      endDate: newStatus === SubscriptionStatus.ACTIVE ? null : effectiveEndDate,
      isPrevious: newStatus === SubscriptionStatus.ACTIVE ? false : subscription.isPrevious,
      notes: notes !== undefined ? notes : subscription.notes,
      updatedBy: operatorId,
    })

    // Cascade status to all bundled package task assignments
    if (newStatus === SubscriptionStatus.CANCELLED || newStatus === SubscriptionStatus.INACTIVE) {
      await CareTaskAssignment.update(
        {
          status: 'CANCELLED',
          isStopped: true,
          stoppedAt: new Date(),
          stoppedBy: stoppedByUserId,
          isActive: false,
          isDeleted: true,
          updatedBy: operatorId,
        },
        {
          where: {
            residentId: subscription.residentId,
            [Op.or]: [
              { packageSubscriptionId: subscription.id },
              { carePackageId: subscription.carePackageId, source: 'PACKAGE' },
            ],
            isDeleted: false,
          },
        },
      )

      await PackageSubscriptionFeature.update(
        { isDeleted: true, updatedBy: operatorId },
        { where: { packageSubscriptionId: subscription.id, isDeleted: false } },
      )

      // If no other ACTIVE subscription exists for this resident, clear carePackageId on Resident
      const remainingActiveSub = await PackageSubscription.findOne({
        where: {
          residentId: subscription.residentId,
          status: SubscriptionStatus.ACTIVE,
          isDeleted: false,
          id: { [Op.ne]: subscription.id },
        },
      })
      if (!remainingActiveSub) {
        await Resident.update(
          { carePackageId: null, updatedBy: operatorId },
          { where: { id: subscription.residentId } },
        )
      }
    } else if (newStatus === SubscriptionStatus.ACTIVE) {
      await Resident.update(
        { carePackageId: subscription.carePackageId, updatedBy: operatorId },
        { where: { id: subscription.residentId } },
      )
      await PackageSubscriptionFeature.update(
        { isDeleted: false, updatedBy: operatorId },
        { where: { packageSubscriptionId: subscription.id } },
      )
      await CareTaskAssignment.update(
        {
          status: 'ACTIVE',
          isStopped: false,
          stoppedAt: null,
          stoppedBy: null,
          isDeleted: false,
          isActive: true,
          updatedBy: operatorId,
        },
        { where: { packageSubscriptionId: subscription.id } },
      )
      await syncPackageTasksForResidents(subscription.residentId, subscription.propertyId)
    }

    res.status(200).json({
      success: true,
      message: `Subscription ${newStatus === SubscriptionStatus.ACTIVE ? 'resumed' : 'stopped'} successfully`,
      data: subscription,
    })
  } catch (error) {
    console.error('[UPDATE SUBSCRIPTION STATUS ERROR]:', error)
    next(error)
  }
}

export const renewPackageSubscription = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const transaction = await sequelize.transaction()
  try {
    const id = String(req.params.id)
    const { startDate } = req.body
    const operatorId = req.user?.id || 'system'

    const currentSubscription = await PackageSubscription.findOne({
      where: { id, isDeleted: false },
      transaction,
    })

    if (!currentSubscription) {
      await transaction.rollback()
      res.status(404).json({ success: false, message: 'Subscription not found' })
      return
    }

    const carePkg = await Package.findByPk(currentSubscription.carePackageId, { transaction })
    if (!carePkg) {
      await transaction.rollback()
      res.status(404).json({ success: false, message: 'Care package not found' })
      return
    }

    const newStartDate = startDate ? new Date(startDate) : new Date()

    // Complete current subscription
    await currentSubscription.update(
      {
        status: SubscriptionStatus.COMPLETED,
        endDate: newStartDate,
        isPrevious: true,
        updatedBy: operatorId,
      },
      { transaction },
    )

    // Create renewed subscription
    const newSubscription = await PackageSubscription.create(
      {
        residentId: currentSubscription.residentId,
        carePackageId: currentSubscription.carePackageId,
        propertyId: currentSubscription.propertyId,
        startDate: newStartDate,
        endDate: null,
        totalCost: carePkg.packageCost,
        status: SubscriptionStatus.ACTIVE,
        isPrevious: false,
        notes: `Renewed subscription from ID: ${currentSubscription.id}`,
        createdBy: operatorId,
        updatedBy: operatorId,
      },
      { transaction },
    )

    // Seed fresh complimentary features
    const featureMappings = await CarePackageFeaturesMap.findAll({
      where: { carePackageId: carePkg.id, isDeleted: false },
      transaction,
    })

    if (featureMappings.length > 0) {
      const toCreate = featureMappings.map((fm) => ({
        packageSubscriptionId: newSubscription.id,
        featureId: fm.featureId,
        complimentaryCount: Number(fm.complimentaryCount || 0),
        remainingCount: Number(fm.complimentaryCount || 0),
        createdBy: operatorId,
        updatedBy: operatorId,
      }))
      await PackageSubscriptionFeature.bulkCreate(toCreate, { transaction })
    }

    await transaction.commit()
    await syncPackageTasksForResidents(newSubscription.residentId, newSubscription.propertyId)

    res.status(200).json({
      success: true,
      message: 'Package subscription renewed successfully',
      data: newSubscription,
    })
  } catch (error) {
    await transaction.rollback()
    console.error('[RENEW PACKAGE SUBSCRIPTION ERROR]:', error)
    next(error)
  }
}
