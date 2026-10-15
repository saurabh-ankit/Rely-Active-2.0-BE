import { SubscriptionStatus } from '../enums/packageSubscription.enum.js'
import {
  CarePackageFeaturesMap,
  CareTaskAssignment,
  Package,
  PackageSubscription,
  PackageSubscriptionFeature,
} from '../models/index.js'

export interface FamilyCarePackageInput {
  residentId: string
  familyMemberId: string
  propertyId: string | null
  /** Package to put the family member on; null removes their current package. */
  carePackageId: string | null
  /** First day of a new package (YYYY-MM-DD); defaults to today. */
  startDate?: string | null
  operatorId: string | null
}

/**
 * Sets a family member's care package. The subscription is stored against the flat's resident
 * with familyMemberId set, so it never mixes with the resident's own package. Picking the same
 * package again changes nothing; a different one (or none) ends the current package today and
 * stops the tasks made from it. Returns true when something changed (tasks need re-syncing).
 */
export async function setFamilyCarePackage(input: FamilyCarePackageInput): Promise<boolean> {
  const { residentId, familyMemberId, operatorId } = input
  const current = await PackageSubscription.findOne({
    where: { residentId, familyMemberId, status: SubscriptionStatus.ACTIVE, isDeleted: false },
  })
  if ((current?.carePackageId ?? null) === (input.carePackageId || null)) return false

  const now = new Date()
  if (current) {
    await current.update({ status: SubscriptionStatus.INACTIVE, endDate: now, isPrevious: true, updatedBy: operatorId })
    await PackageSubscriptionFeature.update(
      { isDeleted: true, updatedBy: operatorId },
      { where: { packageSubscriptionId: current.id, isDeleted: false } },
    )
    await CareTaskAssignment.update(
      {
        status: 'CANCELLED',
        isStopped: true,
        stoppedAt: now,
        stoppedBy: operatorId,
        isActive: false,
        isDeleted: true,
        updatedBy: operatorId,
      },
      { where: { residentId, familyMemberId, source: 'PACKAGE', isDeleted: false } },
    )
  }
  if (!input.carePackageId) return true

  const pkg = await Package.findOne({ where: { id: input.carePackageId, isDeleted: false, isActive: true } })
  if (!pkg) return Boolean(current)

  const subscription = await PackageSubscription.create({
    residentId,
    familyMemberId,
    carePackageId: pkg.id,
    propertyId: input.propertyId,
    startDate: input.startDate ? new Date(input.startDate) : now,
    endDate: null,
    totalCost: pkg.packageCost,
    status: SubscriptionStatus.ACTIVE,
    isPrevious: false,
    notes: `Family member care package: ${pkg.packageName}`,
    createdBy: operatorId,
    updatedBy: operatorId,
  } as never)
  const featureMaps = await CarePackageFeaturesMap.findAll({ where: { carePackageId: pkg.id, isDeleted: false } })
  if (featureMaps.length) {
    await PackageSubscriptionFeature.bulkCreate(
      featureMaps.map((fm) => ({
        packageSubscriptionId: subscription.id,
        featureId: fm.featureId,
        complimentaryCount: Number(fm.complimentaryCount || 0),
        remainingCount: Number(fm.complimentaryCount || 0),
        createdBy: operatorId,
        updatedBy: operatorId,
      })) as never[],
    )
  }
  return true
}
