import { Op, type Transaction } from 'sequelize'
import { AssigneeType } from '../enums/asset.enum.js'
import { OPEN_INVOICE_STATUSES } from '../enums/billing.enum.js'
import { EventRequestStatus, RegistrationStatus } from '../enums/event.enum.js'
import { FnbOrderStatus } from '../enums/fnb.enum.js'
import { OccupancyStatus } from '../enums/propertyUnit.enum.js'
import { ResidentStatus, ResidentType } from '../enums/resident.enum.js'
import { TicketStatus } from '../enums/ticket.enum.js'
import {
  AmenitySlotBooking,
  AmenitySlotConfig,
  Amenity,
  Asset,
  AssetAssignment,
  AssetItem,
  Event,
  EventRegistration,
  EventRequest,
  FnbDish,
  FnbResidentOrder,
  FnbResidentOrderDetail,
  GatePreapproved,
  Invoice,
  PropertyAmenity,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  ResidentUnitMove,
  Ticket,
} from '../models/index.js'
import { originalMoveIn, residentName } from './billing/context.js'
import { getUnbilledForResident } from './billing/invoiceBuilder.service.js'
import { movedAwayInvoiceIds } from './billing/movedInvoices.js'
import { addDays, todayDay } from '../utils/billing/dates.js'

/** Orders not yet delivered or cancelled: they must finish before the resident changes flats. */
const IN_PROGRESS_ORDER_STATUSES = [
  FnbOrderStatus.PLACED,
  FnbOrderStatus.ACCEPTED,
  FnbOrderStatus.PREPARING,
  FnbOrderStatus.READY,
  FnbOrderStatus.DELIVERING_TO_ROOM,
]
const OPEN_TICKET_STATUSES = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD]
const CLOSED_PASS_STATUSES = ['Expired', 'Cancelled', 'Rejected']

/** What staff chose in the "Moving from … to …" panel. Anything left out uses the default. */
export interface UnitChangeChoices {
  /** Assets assigned to the old flat to move to the new one (default: none — fixtures stay). */
  assetAssignmentIds?: string[]
  /** Gate passes to point at the new flat (default: all of them). */
  preapprovalIds?: string[]
}

export class UnitChangeError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message)
  }
}

type UnitWithBlock = PropertyUnit & { floor?: PropertyFloor & { block?: PropertyBlock } }

async function loadUnit(unitId: string) {
  return (await PropertyUnit.findOne({
    where: { id: unitId },
    include: [{ model: PropertyFloor, as: 'floor', include: [{ model: PropertyBlock, as: 'block' }] }],
  })) as UnitWithBlock | null
}

/**
 * Whether the new flat can take the resident: same property, and nobody else living there. A
 * tenant also needs a flat whose owner lives elsewhere (same rule as onboarding).
 */
async function checkTargetFlat(resident: Resident, toUnitId: string): Promise<UnitWithBlock> {
  if (resident.status === ResidentStatus.MOVED_OUT) {
    throw new UnitChangeError('A resident who has moved out cannot change flats')
  }
  const unit = await loadUnit(toUnitId)
  if (!unit) throw new UnitChangeError('Flat not found', 404)
  const propertyId = unit.floor?.block?.propertyId
  if (propertyId && propertyId !== resident.locId) {
    throw new UnitChangeError('The new flat must be in the same property')
  }

  const others = await Resident.findAll({
    where: {
      unitId: toUnitId,
      id: { [Op.ne]: resident.id },
      isDeleted: false,
      status: { [Op.notIn]: [ResidentStatus.INACTIVE, ResidentStatus.MOVED_OUT] },
    },
  })
  if (others.some((r) => r.isResiding)) {
    throw new UnitChangeError(`Flat ${unit.unit_number} is occupied`)
  }
  if (
    resident.residentType === ResidentType.TENANT &&
    !others.some((r) => r.residentType === ResidentType.OWNER && !r.isResiding)
  ) {
    throw new UnitChangeError(`Flat ${unit.unit_number} has no off-site owner to rent from`)
  }
  return unit
}

/**
 * Work that must finish before the resident changes flats: tickets they (or their family) raised
 * that are still open, and food orders not yet delivered or cancelled.
 */
async function unfinishedWork(resident: Resident) {
  const familyIds = (await familyIdsOf(resident.id)).map((f) => f.id)
  const [tickets, orders] = await Promise.all([
    Ticket.findAll({
      where: { ...byResidentOrFamily(resident.id, familyIds), status: OPEN_TICKET_STATUSES },
      attributes: ['id', 'ticketNumber'],
    }),
    FnbResidentOrder.count({
      where: { ...byResidentOrFamily(resident.id, familyIds), orderStatus: IN_PROGRESS_ORDER_STATUSES },
    }),
  ])
  const reasons: string[] = []
  if (tickets.length) {
    reasons.push(
      `${tickets.length} ticket${tickets.length > 1 ? 's are' : ' is'} still open (${tickets
        .map((t) => `#${t.ticketNumber}`)
        .join(', ')}). Complete or close ${tickets.length > 1 ? 'them' : 'it'} before changing the flat.`,
    )
  }
  if (orders) {
    reasons.push(
      `${orders} food order${orders > 1 ? 's are' : ' is'} still open or being delivered. Wait until ${
        orders > 1 ? 'they are' : 'it is'
      } delivered or cancelled before changing the flat.`,
    )
  }
  return reasons
}

/** Refuses the move if the new flat can't take the resident or they have unfinished tickets / orders. */
export async function checkUnitChange(resident: Resident, toUnitId: string): Promise<UnitWithBlock> {
  const unit = await checkTargetFlat(resident, toUnitId)
  const pending = await unfinishedWork(resident)
  if (pending.length) throw new UnitChangeError(pending.join(' '))
  return unit
}

const familyIdsOf = async (residentId: string) =>
  (await ResidentFamilyMember.findAll({ where: { residentId }, attributes: ['id', 'firstName', 'lastName'] })).map(
    (f) => ({ id: f.id, name: `${f.firstName || ''} ${f.lastName || ''}`.trim() || 'Family member' }),
  )

const byResidentOrFamily = (residentId: string, familyIds: string[]) => ({
  [Op.or]: [{ residentId }, ...(familyIds.length ? [{ familyMemberId: familyIds }] : [])],
})

/** Everything tied to the resident's current flat that a move to `toUnitId` affects. */
export async function getUnitChangeImpact(residentId: string, toUnitId: string) {
  const resident = await Resident.findOne({ where: { id: residentId, isDeleted: false } })
  if (!resident) throw new UnitChangeError('Resident not found', 404)
  if (resident.unitId === toUnitId) throw new UnitChangeError('The resident already lives in this flat')

  const blockers: string[] = []
  let toUnit: UnitWithBlock | null = null
  try {
    toUnit = await checkTargetFlat(resident, toUnitId)
  } catch (err) {
    if (!(err instanceof UnitChangeError)) throw err
    blockers.push(err.message)
    toUnit = await loadUnit(toUnitId)
  }
  blockers.push(...(await unfinishedWork(resident)))
  const fromUnit = await PropertyUnit.findByPk(resident.unitId, { attributes: ['id', 'unit_number'] })
  const fromUnitId = resident.unitId
  const moveDate = todayDay()
  const family = await familyIdsOf(resident.id)
  const familyIds = family.map((f) => f.id)
  const who = (familyMemberId: string | null) =>
    (familyMemberId && family.find((f) => f.id === familyMemberId)?.name) || residentName(resident)

  const [unbilled, openInvoices, orders, registrations, requests, bookings, tickets, assets, passes, coResidents] =
    await Promise.all([
      getUnbilledForResident(fromUnitId, resident.id, addDays(moveDate, -1)),
      Invoice.findAll({
        where: { unitId: fromUnitId, isDeleted: false, status: { [Op.in]: [...OPEN_INVOICE_STATUSES] } },
        order: [['startDate', 'ASC']],
      }),
      FnbResidentOrder.findAll({
        where: { ...byResidentOrFamily(resident.id, familyIds), orderStatus: IN_PROGRESS_ORDER_STATUSES },
        include: [
          {
            model: FnbResidentOrderDetail,
            as: 'details',
            required: false,
            include: [{ model: FnbDish, as: 'dish', attributes: ['name'] }],
          },
        ],
        order: [['date', 'ASC']],
      }),
      EventRegistration.findAll({
        where: {
          ...byResidentOrFamily(resident.id, familyIds),
          isDeleted: false,
          status: [RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED],
        },
        include: [{ model: Event, as: 'event', where: { startDate: { [Op.gte]: new Date(`${moveDate}T00:00:00`) } } }],
      }),
      EventRequest.findAll({
        where: {
          residentId: resident.id,
          isDeleted: false,
          status: [EventRequestStatus.OPEN, EventRequestStatus.IN_PROGRESS],
        },
        order: [['startDate', 'ASC']],
      }),
      AmenitySlotBooking.findAll({
        where: { residentId: resident.id, isDeleted: false, status: 'BOOKED', date: { [Op.gte]: moveDate } },
        include: [
          {
            model: AmenitySlotConfig,
            as: 'slotConfig',
            include: [
              {
                model: PropertyAmenity,
                as: 'propertyAmenity',
                include: [{ model: Amenity, as: 'amenity', attributes: ['name'] }],
              },
            ],
          },
        ],
        order: [
          ['date', 'ASC'],
          ['startMinutes', 'ASC'],
        ],
      }),
      Ticket.findAll({
        where: {
          [Op.or]: [
            { unitId: fromUnitId },
            { residentId: resident.id },
            ...(familyIds.length ? [{ familyMemberId: familyIds }] : []),
          ],
          status: OPEN_TICKET_STATUSES,
        },
        order: [['createdAt', 'ASC']],
      }),
      AssetAssignment.findAll({
        where: {
          returnedAt: null,
          [Op.or]: [
            { assigneeType: AssigneeType.FLAT, assigneeId: fromUnitId },
            { assigneeType: AssigneeType.RESIDENT, assigneeId: resident.id },
          ],
        },
        include: [{ model: Asset, as: 'asset', include: [{ model: AssetItem, as: 'item', attributes: ['name'] }] }],
      }),
      GatePreapproved.findAll({
        where: {
          residentId: resident.id,
          unitId: fromUnitId,
          status: { [Op.notIn]: CLOSED_PASS_STATUSES },
          [Op.and]: [{ [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: new Date(`${moveDate}T00:00:00`) } }] }],
        },
      }),
      Resident.findAll({
        where: {
          unitId: fromUnitId,
          id: { [Op.ne]: resident.id },
          isDeleted: false,
          status: { [Op.notIn]: [ResidentStatus.INACTIVE, ResidentStatus.MOVED_OUT] },
        },
      }),
    ])

  const assetJson = (a: AssetAssignment) => {
    const asset = (a as AssetAssignment & { asset?: Asset & { item?: AssetItem } }).asset
    return {
      assignmentId: a.id,
      assetId: a.assetId,
      name: asset?.item?.name ?? 'Asset',
      assetTag: asset?.assetTag ?? asset?.serialNumber ?? null,
      assignedAt: a.assignedAt,
    }
  }
  const ticketJson = (t: Ticket) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    status: t.status,
    unitId: t.unitId,
    createdAt: t.createdAt,
  })
  const earlierHousehold = await movedAwayInvoiceIds(fromUnitId)
  const raisedByResident = (t: Ticket) =>
    t.residentId === resident.id || (!!t.familyMemberId && familyIds.includes(t.familyMemberId))

  return {
    resident: { id: resident.id, name: residentName(resident) },
    fromUnit: fromUnit ? { id: fromUnit.id, unitNumber: fromUnit.unit_number } : null,
    toUnit: toUnit ? { id: toUnit.id, unitNumber: toUnit.unit_number } : null,
    moveDate,
    canMove: blockers.length === 0,
    blockers,
    unbilled,
    // Unpaid bills of the old flat move with the household (an earlier household's stay behind).
    openInvoices: openInvoices
      .filter((inv) => Number(inv.remainingBalance) > 0 && !earlierHousehold.has(inv.id))
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        startDate: String(inv.startDate),
        endDate: String(inv.endDate),
        status: inv.status,
        balance: Number(inv.remainingBalance),
      })),
    foodOrders: orders.map((o) => ({
      id: o.id,
      date: String(o.date).slice(0, 10),
      mealSlot: (o.get('mealSlot') as string | null) ?? null,
      status: o.orderStatus,
      totalAmount: Number(o.totalAmount),
      consumerName: who(o.familyMemberId),
      items: (o.details ?? [])
        .map(
          (d) => `${(d as FnbResidentOrderDetail & { dish?: FnbDish }).dish?.name || 'Item'} × ${Number(d.quantity)}`,
        )
        .join(', '),
    })),
    eventRegistrations: registrations.map((r) => {
      const event = (r as EventRegistration & { event?: Event }).event
      return {
        id: r.id,
        title: event?.title ?? 'Event',
        startDate: event?.startDate ?? null,
        status: r.status,
        seatCount: r.seatCount,
        entryFee: Number((event as Event & { entryFee?: number })?.entryFee ?? 0),
        consumerName: who(r.familyMemberId),
      }
    }),
    eventRequests: requests.map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      title: r.title,
      startDate: r.startDate,
      status: r.status,
    })),
    amenityBookings: bookings.map((b) => {
      const cfg = (
        b as AmenitySlotBooking & {
          slotConfig?: AmenitySlotConfig & { propertyAmenity?: PropertyAmenity & { amenity?: Amenity } }
        }
      ).slotConfig
      return {
        id: b.id,
        amenity: cfg?.propertyAmenity?.amenity?.name ?? 'Amenity',
        date: b.date,
        startMinutes: b.startMinutes,
      }
    }),
    tickets: {
      /** Raised by the resident or their family: billed to the new flat when chargeable. */
      raisedByResident: tickets.filter(raisedByResident).map(ticketJson),
      /** Raised for the old flat by nobody in this household: stay with the old flat. */
      flatOnly: tickets.filter((t) => !raisedByResident(t) && t.unitId === fromUnitId).map(ticketJson),
    },
    assets: {
      flat: assets.filter((a) => a.assigneeType === AssigneeType.FLAT).map(assetJson),
      resident: assets.filter((a) => a.assigneeType === AssigneeType.RESIDENT).map(assetJson),
    },
    gatePasses: passes.map((p) => ({
      id: p.id,
      visitorName: p.visitorName,
      visitorType: p.visitorType,
      scheduleType: p.scheduleType,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
    })),
    coResidents: coResidents.map((r) => ({ id: r.id, name: residentName(r), residentType: r.residentType })),
  }
}

/** Sets a flat's occupancy from whoever lives there now. */
export async function refreshOccupancy(unitId: string, transaction?: Transaction) {
  const unit = await PropertyUnit.findByPk(unitId, { transaction: transaction ?? null })
  if (!unit) return
  const residing = await Resident.findOne({
    where: { unitId, isResiding: true, isDeleted: false },
    transaction: transaction ?? null,
  })
  if (!residing) await unit.update({ occupancyStatus: OccupancyStatus.VACANT }, { transaction: transaction ?? null })
  else if (residing.residentType === ResidentType.OWNER)
    await unit.update({ occupancyStatus: OccupancyStatus.OWNER_OCCUPIED }, { transaction: transaction ?? null })
  else if (residing.residentType === ResidentType.TENANT)
    await unit.update({ occupancyStatus: OccupancyStatus.TENANT_OCCUPIED }, { transaction: transaction ?? null })
}

/**
 * Moves the resident to the new flat: records the move (billing carries the old flat's unbilled
 * charges over from it), and applies the panel's choices for assets and gate passes. Only called
 * once checkUnitChange passed, so there are no open orders or tickets left to deal with.
 */
export async function applyUnitChange(
  resident: Resident,
  toUnitId: string,
  choices: UnitChangeChoices,
  userId: string | null,
  transaction: Transaction,
) {
  const fromUnitId = resident.unitId
  const moveDate = todayDay()

  await resident.update({ unitId: toUnitId, updatedBy: userId }, { transaction })
  await ResidentUnitMove.create(
    { residentId: resident.id, fromUnitId, toUnitId, moveDate, createdBy: userId, updatedBy: userId },
    { transaction },
  )

  // Assets assigned to the old flat stay there unless staff moved them.
  if (choices.assetAssignmentIds?.length) {
    const moving = await AssetAssignment.findAll({
      where: {
        id: choices.assetAssignmentIds,
        assigneeType: AssigneeType.FLAT,
        assigneeId: fromUnitId,
        returnedAt: null,
      },
      transaction,
    })
    const now = new Date()
    for (const a of moving) {
      await a.update({ returnedAt: now, notes: a.notes ?? 'Moved with the resident to another flat' }, { transaction })
      await AssetAssignment.create(
        {
          assetId: a.assetId,
          assigneeType: AssigneeType.FLAT,
          assigneeId: toUnitId,
          bedId: null,
          roomId: null,
          locationId: a.locationId,
          assignedBy: userId ?? a.assignedBy,
          assignedAt: now,
          expectedReturnDate: a.expectedReturnDate,
          notes: 'Moved from the old flat with the resident',
          createdBy: userId,
        } as never,
        { transaction },
      )
    }
  }

  // Visitors on the resident's passes are sent to the new flat unless staff kept them.
  await GatePreapproved.update(
    { unitId: toUnitId, updatedBy: userId },
    {
      where: {
        residentId: resident.id,
        unitId: fromUnitId,
        status: { [Op.notIn]: CLOSED_PASS_STATUSES },
        ...(choices.preapprovalIds ? { id: choices.preapprovalIds } : {}),
      },
      transaction,
    },
  )

  await refreshOccupancy(fromUnitId, transaction)
  await refreshOccupancy(toUnitId, transaction)
}

/**
 * The flats the resident has lived in, oldest first, with the days they lived in each (the last
 * one is the current flat, `to` null). `currentFlatMovedIn` is the day they moved into it.
 */
export async function getFlatHistory(resident: Pick<Resident, 'id' | 'unitId' | 'moveInDate' | 'createdAt'>) {
  const moves = await ResidentUnitMove.findAll({
    where: { residentId: resident.id, isDeleted: false },
    order: [
      ['moveDate', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  })
  const unitIds = [...new Set([...moves.flatMap((m) => [m.fromUnitId, m.toUnitId]), resident.unitId])]
  const units = (await PropertyUnit.findAll({
    where: { id: unitIds },
    attributes: ['id', 'unit_number', 'unit_type', 'floorId'],
    include: [
      {
        model: PropertyFloor,
        as: 'floor',
        attributes: ['id', 'floor_number', 'floor_name', 'is_virtual'],
        include: [{ model: PropertyBlock, as: 'block', attributes: ['id', 'block_name', 'is_virtual'] }],
      },
    ],
  })) as UnitWithBlock[]
  const unitOf = (id: string) => units.find((u) => u.id === id) ?? null

  const flats: { unit: UnitWithBlock | null; from: string | null; to: string | null; current: boolean }[] = []
  let from = originalMoveIn(resident)
  for (const m of moves) {
    const moveDate = String(m.moveDate)
    flats.push({ unit: unitOf(m.fromUnitId), from, to: addDays(moveDate, -1), current: false })
    from = moveDate
  }
  flats.push({ unit: unitOf(resident.unitId), from, to: null, current: true })
  return { currentFlatMovedIn: from, flatHistory: flats }
}
