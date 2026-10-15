import { Op } from 'sequelize'
import { OwnershipType, ResidentStatus, ResidentType } from '../../enums/resident.enum.js'
import { PropertyBlock, PropertyFloor, PropertyUnit, Resident, ResidentFamilyMember } from '../../models/index.js'
import type { InvoiceBillTo } from '../../models/invoice.model.js'
import { localDay, toDay } from '../../utils/billing/dates.js'
import type { UnitBillingContext } from './types.js'

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message)
  }
}

/**
 * Residents who are billed for a flat: those living in it, plus those who have moved out
 * (they owe for the time they lived there). Off-site residents — e.g. an owner who lets
 * the flat and lives elsewhere (isResiding = false, never moved out) — are not billed.
 */
export const BILLABLE_RESIDENT_WHERE = {
  isDeleted: false,
  [Op.or]: [{ isResiding: true }, { moveOutDate: { [Op.ne]: null } }, { status: ResidentStatus.MOVED_OUT }],
}

export const residentName = (r: Pick<Resident, 'firstName' | 'lastName'>): string =>
  `${r.firstName || ''} ${r.lastName || ''}`.trim() || 'Resident'

export async function loadUnitContext(unitId: string): Promise<UnitBillingContext> {
  const unit = await PropertyUnit.findOne({
    where: { id: unitId, isDeleted: false },
    include: [{ model: PropertyFloor, as: 'floor', include: [{ model: PropertyBlock, as: 'block' }] }],
  })
  if (!unit) throw new BillingError('Flat not found', 404)

  const residents = await Resident.findAll({
    where: { unitId, ...BILLABLE_RESIDENT_WHERE },
    order: [['createdAt', 'ASC']],
  })
  const residentIds = residents.map((r) => r.id)

  const familyMembers = residentIds.length
    ? await ResidentFamilyMember.findAll({
        where: { residentId: residentIds, isDeleted: false },
        attributes: ['id', 'residentId', 'firstName', 'lastName', 'relation', 'phone', 'isResiding'],
        order: [['createdAt', 'ASC']],
      })
    : []
  const familyToResident = new Map(familyMembers.map((f) => [f.id, f.residentId]))

  const floor = (unit as PropertyUnit & { floor?: PropertyFloor & { block?: PropertyBlock } }).floor
  const propertyId = floor?.block?.propertyId || residents[0]?.locId
  if (!propertyId) throw new BillingError('Could not resolve the property for this flat')

  return {
    unitId,
    unitNumber: unit.unit_number,
    propertyId,
    residents,
    residentIds,
    familyToResident,
    familyMemberIds: [...familyToResident.keys()],
    familyMembers,
    movedInDate:
      residents
        .map((r) => toDay(r.moveInDate) ?? localDay(r.createdAt))
        .filter((d): d is string => !!d)
        .sort()[0] ?? null,
  }
}

/**
 * Primary payer: the residing resident who is the primary owner, else a residing tenant
 * (tenant-occupied flat), else the longest-standing residing resident, else anyone on record.
 */
export function resolveBillTo(ctx: UnitBillingContext): InvoiceBillTo {
  const residing = ctx.residents.filter((r) => r.isResiding)
  const payer =
    residing.find((r) => r.ownershipType === OwnershipType.PRIMARY && r.residentType === ResidentType.OWNER) ||
    residing.find((r) => r.residentType === ResidentType.TENANT) ||
    residing.find((r) => r.ownershipType === OwnershipType.PRIMARY) ||
    residing[0] ||
    ctx.residents[0]
  return {
    residentId: payer?.id ?? null,
    name: payer ? residentName(payer) : `Flat ${ctx.unitNumber}`,
    phone: payer?.phone ?? null,
    email: payer?.email ?? null,
    unitNumber: ctx.unitNumber,
  }
}

/** A family member id if it belongs to this flat (their charges are shown as theirs). */
export const flatFamilyMemberId = (ctx: UnitBillingContext, familyMemberId: string | null | undefined) =>
  familyMemberId && ctx.familyToResident.has(familyMemberId) ? familyMemberId : null

/** Who used a charge, for the invoice: "Radha Jha (Spouse)" as family member, or the resident. */
export function describeConsumer(
  ctx: UnitBillingContext,
  residentId: string | null,
  familyMemberId: string | null,
): { consumerType: 'RESIDENT' | 'FAMILY_MEMBER' | null; consumerName: string | null } {
  if (familyMemberId) {
    const f = ctx.familyMembers.find((m) => m.id === familyMemberId)
    if (f) {
      const name = `${f.firstName || ''} ${f.lastName || ''}`.trim() || 'Family member'
      return { consumerType: 'FAMILY_MEMBER', consumerName: f.relation ? `${name} (${f.relation})` : name }
    }
  }
  const r = residentId ? ctx.residents.find((x) => x.id === residentId) : null
  return r ? { consumerType: 'RESIDENT', consumerName: residentName(r) } : { consumerType: null, consumerName: null }
}

/** Maps a charge made by a resident or one of their family members to the resident id. */
export const chargeResidentId = (
  ctx: UnitBillingContext,
  residentId: string | null | undefined,
  familyMemberId: string | null | undefined,
): string | null => {
  if (residentId && ctx.residentIds.includes(residentId)) return residentId
  if (familyMemberId) return ctx.familyToResident.get(familyMemberId) ?? null
  return residentId ?? null
}
