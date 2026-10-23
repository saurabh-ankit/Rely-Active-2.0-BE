import { Op } from 'sequelize'
import { RECURRING_SERVICE_TYPES, VOID_INVOICE_STATUSES } from '../../enums/billing.enum.js'
import { OwnershipType, ResidentStatus, ResidentType } from '../../enums/resident.enum.js'
import {
  Invoice,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  ResidentUnitMove,
  ServicesInvoice,
} from '../../models/index.js'
import type { InvoiceBillTo } from '../../models/invoice.model.js'
import { addDays, localDay, toDay } from '../../utils/billing/dates.js'
import type { ServiceLine, UnitBillingContext } from './types.js'

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

/** A resident's original move-in day (when they were added, if no date was recorded). */
export const originalMoveIn = (r: Pick<Resident, 'moveInDate' | 'createdAt'>): string | null =>
  toDay(r.moveInDate) ?? localDay(r.createdAt)

/**
 * The day each resident is billed from on the flat they live in now. A resident who moved here
 * from another flat starts the day after that flat's last invoice before the move: days the old
 * flat never billed come to the new flat, and days it billed in advance aren't billed again.
 * Everyone else: move-in.
 */
export async function residentStartDays(
  residents: Pick<Resident, 'id' | 'unitId' | 'moveInDate' | 'createdAt'>[],
): Promise<Map<string, string | null>> {
  const starts = new Map(residents.map((r) => [r.id, originalMoveIn(r)]))
  if (!residents.length) return starts
  const moves = await ResidentUnitMove.findAll({
    where: { residentId: residents.map((r) => r.id), isDeleted: false },
    order: [['moveDate', 'DESC']],
  })
  const latestIn = new Map<string, ResidentUnitMove>()
  for (const r of residents) {
    const move = moves.find((m) => m.residentId === r.id && m.toUnitId === r.unitId)
    if (move) latestIn.set(r.id, move)
  }
  if (!latestIn.size) return starts
  const fromUnitIds = [...new Set([...latestIn.values()].map((m) => m.fromUnitId))]
  const oldInvoices = await Invoice.findAll({
    where: { unitId: fromUnitIds, isDeleted: false, status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] } },
    attributes: ['unitId', 'startDate', 'endDate'],
  })
  for (const [residentId, move] of latestIn) {
    const moveDate = String(move.moveDate)
    const lastBilled = oldInvoices
      .filter((inv) => inv.unitId === move.fromUnitId && String(inv.startDate) < moveDate)
      .map((inv) => String(inv.endDate))
      .sort()
      .at(-1)
    if (lastBilled) starts.set(residentId, addDays(lastBilled, 1))
  }
  return starts
}

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

  // Moves of this flat's residents (from elsewhere), and residents who left this flat for another.
  const moveRows = await ResidentUnitMove.findAll({
    where: {
      isDeleted: false,
      [Op.or]: [...(residentIds.length ? [{ residentId: residentIds }] : []), { fromUnitId: unitId }],
    },
    order: [['moveDate', 'ASC']],
  })
  const moves = new Map<string, { fromUnitId: string; moveDate: string }[]>()
  for (const m of moveRows) {
    if (!residentIds.includes(m.residentId)) continue
    moves.set(m.residentId, [
      ...(moves.get(m.residentId) ?? []),
      { fromUnitId: m.fromUnitId, moveDate: String(m.moveDate) },
    ])
  }
  const previousUnitIds = [...new Set([...moves.values()].flat().map((m) => m.fromUnitId))]
  const unitNumbers = new Map([[unitId, unit.unit_number]])
  if (previousUnitIds.length) {
    const units = await PropertyUnit.findAll({ where: { id: previousUnitIds }, attributes: ['id', 'unit_number'] })
    for (const u of units) unitNumbers.set(u.id, u.unit_number)
  }
  const movedAwayResidentIds = new Set(
    moveRows.filter((m) => m.fromUnitId === unitId && !residentIds.includes(m.residentId)).map((m) => m.residentId),
  )
  const movedAwayFamilyMemberIds = new Set(
    movedAwayResidentIds.size
      ? (
          await ResidentFamilyMember.findAll({
            where: { residentId: [...movedAwayResidentIds] },
            attributes: ['id'],
          })
        ).map((f) => f.id)
      : [],
  )

  // Rent / package days a moved resident was already billed for on their old flat.
  const billedElsewhere = new Map<string, string>()
  if (moves.size) {
    const rows = await ServicesInvoice.findAll({
      where: {
        residentId: [...moves.keys()],
        isDeleted: false,
        serviceType: [...RECURRING_SERVICE_TYPES],
        sourceId: { [Op.ne]: null },
        isAdjustment: false,
      },
      attributes: ['serviceType', 'sourceId', 'serviceEndDate'],
      include: [
        {
          model: Invoice,
          as: 'invoice',
          attributes: [],
          where: { unitId: { [Op.ne]: unitId }, isDeleted: false, status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] } },
        },
      ],
    })
    for (const row of rows) {
      const key = `${row.serviceType}:${row.sourceId}`
      const end = String(row.serviceEndDate ?? '')
      if (end && end > (billedElsewhere.get(key) ?? '')) billedElsewhere.set(key, end)
    }
  }

  const starts = await residentStartDays(residents)
  const earliest = (days: (string | null | undefined)[]) => days.filter((d): d is string => !!d).sort()[0] ?? null

  return {
    unitId,
    unitNumber: unit.unit_number,
    propertyId,
    residents,
    residentIds,
    familyToResident,
    familyMemberIds: [...familyToResident.keys()],
    familyMembers,
    movedInDate: earliest(residents.map((r) => starts.get(r.id))),
    usageFromDate: earliest(residents.map(originalMoveIn)),
    moves,
    movedAwayResidentIds,
    movedAwayFamilyMemberIds,
    billedElsewhere,
    unitNumbers,
  }
}

/**
 * The old flat a charge was used in: the flat the resident lived in on that day, when it is not
 * this one (null for charges from their time in this flat).
 */
export function fromUnitFor(ctx: UnitBillingContext, residentId: string | null, day: string): string | null {
  if (!residentId) return null
  const next = (ctx.moves.get(residentId) ?? []).find((m) => m.moveDate > day)
  return next && next.fromUnitId !== ctx.unitId ? next.fromUnitId : null
}

/** Whether a charge belongs to a resident (or their family member) who moved from this flat to another. */
export const isMovedAway = (
  ctx: UnitBillingContext,
  residentId: string | null | undefined,
  familyMemberId: string | null | undefined,
) =>
  (!!residentId && ctx.movedAwayResidentIds.has(residentId)) ||
  (!!familyMemberId && ctx.movedAwayFamilyMemberIds.has(familyMemberId))

/** Fills in the old flat's number on lines carried over from it. */
export async function labelOldFlats(ctx: UnitBillingContext, lines: ServiceLine[]): Promise<ServiceLine[]> {
  const missing = [...new Set(lines.map((l) => l.fromUnitId).filter((id): id is string => !!id))].filter(
    (id) => !ctx.unitNumbers.has(id),
  )
  if (missing.length) {
    const units = await PropertyUnit.findAll({ where: { id: missing }, attributes: ['id', 'unit_number'] })
    for (const u of units) ctx.unitNumbers.set(u.id, u.unit_number)
  }
  return lines.map((l) => (l.fromUnitId ? { ...l, fromUnitNumber: ctx.unitNumbers.get(l.fromUnitId) ?? null } : l))
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
