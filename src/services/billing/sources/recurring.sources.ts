import { Op } from 'sequelize'
import { ServiceType } from '../../../enums/billing.enum.js'
import { FnbSubscriptionStatus } from '../../../enums/fnb.enum.js'
import { SubscriptionStatus } from '../../../enums/packageSubscription.enum.js'
import { ResidentType } from '../../../enums/resident.enum.js'
import {
  FnbGlobalPackage,
  FnbPropertyPackage,
  FnbResidentPackage,
  Package,
  PackageSubscription,
} from '../../../models/index.js'
import { addDays, localDay, toDay } from '../../../utils/billing/dates.js'
import { chargeResidentId, flatFamilyMemberId, residentName } from '../context.js'
import type { RecurringItem, RecurringSource } from '../types.js'

/**
 * When one subscription replaces another the old one is closed on the new one's start
 * date. End each one the day before the next starts so no day is charged twice
 * (Assist's "bridge" rule), per subscriber — but a package always keeps its own start
 * day: one used for a single day and replaced the same day is still billed for that day
 * (as the Medical page costs it).
 */
const bridge = (items: (RecurringItem & { ownerKey: string })[]): RecurringItem[] => {
  const byOwner = new Map<string, (RecurringItem & { ownerKey: string })[]>()
  for (const item of items) byOwner.set(item.ownerKey, [...(byOwner.get(item.ownerKey) ?? []), item])
  for (const list of byOwner.values()) {
    // By start date; on the same day the one that ended (the replaced package) comes first.
    list.sort(
      (a, b) =>
        (a.activeFrom ?? '').localeCompare(b.activeFrom ?? '') ||
        (a.activeTo ?? '9999-12-31').localeCompare(b.activeTo ?? '9999-12-31'),
    )
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i]!
      const next = list[i + 1]!
      if (next.activeFrom && (cur.activeTo === null || cur.activeTo >= next.activeFrom)) {
        const dayBefore = addDays(next.activeFrom, -1)
        cur.activeTo = cur.activeFrom && dayBefore < cur.activeFrom ? cur.activeFrom : dayBefore
      }
    }
  }
  return items.map(({ ownerKey: _ownerKey, ...item }) => item)
}

/** Rent: only tenants who pay rent to the company, for the days they live in the flat. */
export const rentSource: RecurringSource = {
  serviceType: ServiceType.RENT,
  adjustable: false,
  async load(ctx) {
    return ctx.residents
      .filter((r) => r.residentType === ResidentType.TENANT && r.payRentToCompany && Number(r.rentAmount) > 0)
      .map((r) => ({
        sourceId: r.id,
        residentId: r.id,
        name: `Rent – ${residentName(r)}`,
        monthlyPrice: Number(r.rentAmount),
        activeFrom: toDay(r.moveInDate),
        activeTo: toDay(r.moveOutDate) ?? (r.isResiding ? null : localDay(r.updatedAt)),
      }))
  },
}

export const carePackageSource: RecurringSource = {
  serviceType: ServiceType.CARE_PACKAGE,
  adjustable: true,
  async load(ctx) {
    if (!ctx.residentIds.length) return []
    const subs = await PackageSubscription.findAll({
      where: { residentId: ctx.residentIds, isDeleted: false },
      include: [{ model: Package, as: 'carePackage' }],
    })
    return bridge(
      subs.map((sub) => {
        const pkg = sub.carePackage
        const ended = sub.status !== SubscriptionStatus.ACTIVE
        return {
          // The resident's package and each family member's package are separate timelines.
          ownerKey: sub.familyMemberId ? `fm:${sub.familyMemberId}` : sub.residentId,
          sourceId: sub.id,
          residentId: sub.residentId,
          familyMemberId: flatFamilyMemberId(ctx, sub.familyMemberId),
          name: `Care Package – ${pkg?.packageName || 'Care Package'}`,
          // totalCost is the price agreed when the resident subscribed.
          monthlyPrice: Number(sub.totalCost || pkg?.packageCost || 0),
          activeFrom: localDay(sub.startDate),
          activeTo: localDay(sub.endDate) ?? (ended ? localDay(sub.updatedAt) : null),
        }
      }),
    ).filter((item) => item.monthlyPrice > 0)
  },
}

/** Food packages of residents and their family members. totalPrice already includes delivery. */
export const foodPackageSource: RecurringSource = {
  serviceType: ServiceType.FOOD_PACKAGE,
  adjustable: true,
  async load(ctx) {
    if (!ctx.residentIds.length) return []
    const subs = await FnbResidentPackage.findAll({
      where: {
        [Op.or]: [
          { residentId: ctx.residentIds },
          ...(ctx.familyMemberIds.length ? [{ familyMemberId: ctx.familyMemberIds }] : []),
        ],
      },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
      ],
    })
    return bridge(
      subs.map((sub) => {
        const propPkg = sub.propertyPackage
        const ended = sub.status === FnbSubscriptionStatus.CANCELLED || sub.status === FnbSubscriptionStatus.COMPLETED
        return {
          ownerKey: sub.familyMemberId ? `fm:${sub.familyMemberId}` : `r:${sub.residentId}`,
          sourceId: sub.id,
          residentId: chargeResidentId(ctx, sub.residentId, sub.familyMemberId),
          familyMemberId: flatFamilyMemberId(ctx, sub.familyMemberId),
          name: `Food Package – ${propPkg?.globalPackage?.name || 'Food Package'}`,
          monthlyPrice: Number(sub.totalPrice ?? propPkg?.price ?? 0),
          activeFrom: toDay(sub.startDate),
          activeTo: toDay(sub.endDate) ?? (ended ? localDay(sub.updatedAt) : null),
        }
      }),
    ).filter((item) => item.monthlyPrice > 0)
  },
}

export const RECURRING_SOURCES: RecurringSource[] = [rentSource, carePackageSource, foodPackageSource]
