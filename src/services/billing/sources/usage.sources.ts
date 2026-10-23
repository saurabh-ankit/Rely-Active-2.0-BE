import { Op } from 'sequelize'
import { AppointmentStatus } from '../../../enums/appointment.enum.js'
import { ServiceType } from '../../../enums/billing.enum.js'
import { EventRequestStatus, RegistrationStatus } from '../../../enums/event.enum.js'
import { FnbOrderStatus } from '../../../enums/fnb.enum.js'
import { TicketStatus } from '../../../enums/ticket.enum.js'
import {
  AdditionalTaskCharge,
  CareTaskAssignment,
  DoctorAppointment,
  Event,
  EventRegistration,
  EventRequest,
  EventVenue,
  FnbDish,
  FnbResidentOrder,
  FnbResidentOrderDetail,
  LabTestSetting,
  ResidentLabReport,
  Ticket,
  UnitMiscellaneousItem,
  User,
  UserDetail,
} from '../../../models/index.js'
import {
  InventoryIssueAllocation,
  InventoryStockTransaction,
  InventoryStockTransactionLine,
} from '../../../models/inventoryStock.model.js'
import { localDay, localDayBounds, roundMoney, toDay } from '../../../utils/billing/dates.js'
import { chargeResidentId, flatFamilyMemberId, isMovedAway } from '../context.js'
import { usageLine, type ServiceLine, type UsageSource, type UnitBillingContext } from '../types.js'

type ChargeWithAssignment = AdditionalTaskCharge & { taskAssignment?: CareTaskAssignment | null }
type AppointmentWithDoctor = DoctorAppointment & { doctor?: User | null }
type IssueWithLines = InventoryStockTransaction & { lines?: InventoryStockTransactionLine[] }
type RegistrationWithEvent = EventRegistration & { event?: Event | null }
type RequestWithVenue = EventRequest & { venue?: EventVenue | null }

const residentOrFamily = (ctx: UnitBillingContext) => ({
  [Op.or]: [
    { residentId: ctx.residentIds },
    ...(ctx.familyMemberIds.length ? [{ familyMemberId: ctx.familyMemberIds }] : []),
  ],
})

/**
 * Delivered à-la-carte orders. totalAmount already includes the delivery charge, and a
 * package-covered order can still carry a delivery charge, so any order above ₹0 is billed.
 */
export const foodOrderSource: UsageSource = {
  serviceType: ServiceType.FOOD_ORDER,
  async load(ctx, from, to) {
    if (!ctx.residentIds.length) return []
    const orders = await FnbResidentOrder.findAll({
      where: {
        ...residentOrFamily(ctx),
        orderStatus: { [Op.in]: [FnbOrderStatus.DELIVERED, FnbOrderStatus.COMPLETED] },
        totalAmount: { [Op.gt]: 0 },
        date: { [Op.between]: [from, to] },
      },
      include: [
        {
          model: FnbResidentOrderDetail,
          as: 'details',
          required: false,
          include: [{ model: FnbDish, as: 'dish', attributes: ['name'] }],
        },
      ],
    })
    return orders.map((order) => {
      const dishes = (order.details ?? [])
        .map((d) => `${d.dish?.name || 'Item'}${Number(d.quantity) > 1 ? ` × ${Number(d.quantity)}` : ''}`)
        .join(', ')
      const delivery = Number(order.deliveryCharge || 0)
      const total = roundMoney(Number(order.totalAmount))
      const day = toDay(order.date) as string
      return usageLine(ServiceType.FOOD_ORDER, {
        sourceId: order.id,
        residentId: chargeResidentId(ctx, order.residentId, order.familyMemberId),
        familyMemberId: flatFamilyMemberId(ctx, order.familyMemberId),
        name: order.isPackageCovered ? 'Food Order – delivery' : 'Food Order',
        description: [dishes, delivery > 0 ? `incl. delivery ₹${delivery}` : '', `on ${day}`]
          .filter(Boolean)
          .join(' · '),
        quantity: 1,
        price: total,
        total,
        serviceDate: day,
      })
    })
  },
}

/**
 * Care task charges. Sessions covered by a care package's complimentary quota never create a
 * charge, so only these are billed: sessions done after the package's free sessions ran out, and
 * add-on tasks outside the package (per session, or the prorated monthly add-on fee).
 */
export const additionalTaskSource: UsageSource = {
  serviceType: ServiceType.ADDITIONAL_TASK,
  async load(ctx, from, to) {
    if (!ctx.residentIds.length) return []
    const charges = (await AdditionalTaskCharge.findAll({
      where: {
        residentId: ctx.residentIds,
        isDeleted: false,
        price: { [Op.gt]: 0 },
        completedAt: { [Op.between]: localDayBounds(from, to) },
      },
      include: [{ model: CareTaskAssignment, as: 'taskAssignment', attributes: ['source'], required: false }],
    })) as ChargeWithAssignment[]
    return charges.map((charge) => {
      const total = roundMoney(Number(charge.price))
      const rate = Number(charge.unitPrice) > 0 ? Number(charge.unitPrice) : total
      // Whole sessions show as qty × rate; a prorated monthly fee shows as one line at its amount.
      const sessions = total / rate
      const wholeSessions = Number.isInteger(sessions) && sessions >= 1
      const day = localDay(charge.completedAt) as string
      // A package task is only charged once its free sessions are used up.
      const kind = charge.taskAssignment?.source === 'PACKAGE' ? 'beyond package limit' : 'additional task'
      return usageLine(ServiceType.ADDITIONAL_TASK, {
        sourceId: charge.id,
        residentId: charge.residentId,
        familyMemberId: flatFamilyMemberId(ctx, charge.familyMemberId),
        name: `${charge.taskName || 'Care Task'} – ${kind}`,
        description: `${charge.description ? `${charge.description} ` : ''}(on ${day})`,
        quantity: wholeSessions ? sessions : 1,
        price: wholeSessions ? rate : total,
        total,
        serviceDate: day,
      })
    })
  },
}

/** Attended doctor appointments, at the fee captured when the appointment was booked. */
export const doctorConsultationSource: UsageSource = {
  serviceType: ServiceType.DOCTOR_CONSULTATION,
  async load(ctx, from, to) {
    if (!ctx.residentIds.length) return []
    const appointments = (await DoctorAppointment.findAll({
      where: {
        residentId: ctx.residentIds,
        isDeleted: false,
        status: AppointmentStatus.ATTENDED,
        appointmentDate: { [Op.between]: [from, to] },
      },
      include: [
        {
          model: User,
          as: 'doctor',
          attributes: ['id'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName', 'consultantFee'] }],
        },
      ],
    })) as AppointmentWithDoctor[]
    const lines: ServiceLine[] = []
    for (const appt of appointments) {
      const profile = appt.doctor?.profile
      // Appointments booked before the fee was captured fall back to the doctor's current fee.
      const fee = roundMoney(Number(appt.fee ?? profile?.consultantFee ?? 0))
      if (fee <= 0) continue
      const doctorName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || 'Doctor'
      const day = toDay(appt.appointmentDate) as string
      lines.push(
        usageLine(ServiceType.DOCTOR_CONSULTATION, {
          sourceId: appt.id,
          residentId: chargeResidentId(ctx, appt.residentId, appt.familyMemberId),
          familyMemberId: flatFamilyMemberId(ctx, appt.familyMemberId),
          name: `Consultation – Dr. ${doctorName}`,
          description: `${appt.slotTimeRange ? `${appt.slotTimeRange} ` : ''}(on ${day})`,
          quantity: 1,
          price: fee,
          total: fee,
          serviceDate: day,
        }),
      )
    }
    return lines
  },
}

/** Lab tests with a cost that were not already paid at the lab. */
export const labTestSource: UsageSource = {
  serviceType: ServiceType.LAB_TEST,
  async load(ctx, from, to) {
    if (!ctx.residentIds.length) return []
    const reports = await ResidentLabReport.findAll({
      where: {
        residentId: ctx.residentIds,
        isDeleted: false,
        cost: { [Op.gt]: 0 },
        [Op.and]: [{ [Op.or]: [{ paymentMethod: null }, { paymentMethod: '' }] }],
        reportDate: { [Op.between]: [from, to] },
      },
      include: [{ model: LabTestSetting, as: 'labTestSetting', attributes: ['name'] }],
    })
    return reports.map((report) => {
      const cost = roundMoney(Number(report.cost))
      const day = toDay(report.reportDate) as string
      return usageLine(ServiceType.LAB_TEST, {
        sourceId: report.id,
        residentId: report.residentId,
        name: `Lab Test – ${report.labTestSetting?.name || 'Lab Test'}`,
        description: `(on ${day})`,
        quantity: 1,
        price: cost,
        total: cost,
        serviceDate: day,
      })
    })
  },
}

/** Medicines and consumables issued from center inventory, at MRP. */
export const inventoryItemSource: UsageSource = {
  serviceType: ServiceType.INVENTORY_ITEM,
  async load(ctx, from, to) {
    if (!ctx.residentIds.length) return []
    const issues = (await InventoryStockTransaction.findAll({
      where: { residentId: ctx.residentIds, transactionType: 'issue', date: { [Op.between]: [from, to] } },
      include: [{ model: InventoryStockTransactionLine, as: 'lines' }],
    })) as IssueWithLines[]
    const lineIds = issues.flatMap((tx) => (tx.lines ?? []).map((l) => l.id))
    const allocations = lineIds.length
      ? await InventoryIssueAllocation.findAll({
          where: { issueLineId: lineIds },
          attributes: ['issueLineId', 'mrpAmount'],
        })
      : []
    const mrpByLine = new Map<string, number>()
    for (const a of allocations) mrpByLine.set(a.issueLineId, (mrpByLine.get(a.issueLineId) ?? 0) + Number(a.mrpAmount))

    const lines: ServiceLine[] = []
    for (const tx of issues) {
      const day = toDay(tx.date) as string
      for (const line of tx.lines ?? []) {
        const packQty = Number(line.packQuantity) > 0 ? Number(line.packQuantity) : 1
        const qty = Number(line.quantity)
        const total = roundMoney(mrpByLine.get(line.id) ?? (qty / packQty) * Number(line.mrpPrice))
        if (total <= 0) continue
        lines.push(
          usageLine(ServiceType.INVENTORY_ITEM, {
            sourceId: line.id,
            residentId: tx.residentId,
            name: line.itemName || 'Inventory Item',
            description: `${line.batchNumber ? `Batch ${line.batchNumber} ` : ''}(on ${day})`,
            quantity: qty,
            price: qty > 0 ? roundMoney(total / qty) : total,
            total,
            serviceDate: day,
          }),
        )
      }
    }
    return lines
  },
}

/** Paid event registrations: entry fee × seats. */
export const eventFeeSource: UsageSource = {
  serviceType: ServiceType.EVENT_FEE,
  async load(ctx, from, to) {
    if (!ctx.residentIds.length) return []
    const registrations = (await EventRegistration.findAll({
      where: {
        residentId: ctx.residentIds,
        isDeleted: false,
        status: { [Op.in]: [RegistrationStatus.CONFIRMED, RegistrationStatus.ATTENDED] },
        registrationDate: { [Op.between]: [from, to] },
      },
      include: [{ model: Event, as: 'event', where: { entryFee: { [Op.gt]: 0 } } }],
    })) as RegistrationWithEvent[]
    return registrations.map((reg) => {
      const fee = Number(reg.event?.entryFee || 0)
      const seats = Number(reg.seatCount) || 1
      const day = toDay(reg.registrationDate) as string
      return usageLine(ServiceType.EVENT_FEE, {
        sourceId: reg.id,
        residentId: reg.residentId,
        // Walk-ins at events without reservations are recorded per person.
        familyMemberId: flatFamilyMemberId(ctx, reg.familyMemberId),
        name: `Event – ${reg.event?.title || 'Community Event'}`,
        description: `${seats} seat${seats > 1 ? 's' : ''} (on ${day})`,
        quantity: seats,
        price: fee,
        total: roundMoney(fee * seats),
        serviceDate: day,
      })
    })
  },
}

/** Confirmed venue bookings: venue price + add-on services. */
export const venueBookingSource: UsageSource = {
  serviceType: ServiceType.VENUE_BOOKING,
  async load(ctx, from, to) {
    if (!ctx.residentIds.length) return []
    const requests = (await EventRequest.findAll({
      where: {
        residentId: ctx.residentIds,
        isDeleted: false,
        status: EventRequestStatus.CLOSED,
        confirmedEventId: { [Op.ne]: null },
        startDate: { [Op.between]: localDayBounds(from, to) },
      },
      include: [{ model: EventVenue, as: 'venue' }],
    })) as RequestWithVenue[]
    const lines: ServiceLine[] = []
    for (const req of requests) {
      const venueCost = Number(req.venue?.price ?? 0) || 0
      const servicesCost = (Array.isArray(req.selectedServices) ? req.selectedServices : []).reduce(
        (sum, s) => sum + (Number(s.price ?? 0) || 0) * (Number((s as { quantity?: number }).quantity ?? 1) || 1),
        0,
      )
      const total = roundMoney(venueCost + servicesCost)
      if (total <= 0) continue
      const day = localDay(req.startDate) as string
      lines.push(
        usageLine(ServiceType.VENUE_BOOKING, {
          sourceId: req.id,
          residentId: req.residentId,
          name: `Venue Booking – ${req.venue?.name || 'Venue'}`,
          description: `${req.title}${req.requestNumber ? ` (#${req.requestNumber})` : ''} (on ${day})`,
          quantity: 1,
          price: total,
          total,
          serviceDate: day,
        }),
      )
    }
    return lines
  },
}

/**
 * Tickets are free unless staff recorded an invoice amount on them. A ticket raised by a resident
 * who has since moved to another flat is billed there, with the flat it was raised for.
 */
export const maintenanceSource: UsageSource = {
  serviceType: ServiceType.MAINTENANCE,
  async load(ctx, from, to) {
    const tickets = await Ticket.findAll({
      where: {
        [Op.or]: [{ unitId: ctx.unitId }, ...(ctx.residentIds.length ? [{ residentId: ctx.residentIds }] : [])],
        status: { [Op.in]: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
        invoiceAmount: { [Op.gt]: 0 },
      },
    })
    const lines: ServiceLine[] = []
    for (const t of tickets) {
      if (isMovedAway(ctx, t.residentId, t.familyMemberId)) continue
      const day = localDay(t.completedAt ?? t.resolvedAt ?? t.closedAt ?? t.updatedAt)
      if (!day || day < from || day > to) continue
      const amount = roundMoney(Number(t.invoiceAmount))
      lines.push(
        usageLine(ServiceType.MAINTENANCE, {
          sourceId: t.id,
          residentId: chargeResidentId(ctx, t.residentId, t.familyMemberId),
          familyMemberId: flatFamilyMemberId(ctx, t.familyMemberId),
          name: `Maintenance – ${t.title || 'Repair'}`,
          description: `Ticket #${t.ticketNumber} (on ${day})`,
          quantity: 1,
          price: amount,
          total: amount,
          serviceDate: day,
          fromUnitId: t.unitId,
        }),
      )
    }
    return lines
  },
}

/**
 * Charges staff logged against the flat before billing. One logged for a resident follows them
 * when they move to another flat.
 */
export const miscellaneousItemSource: UsageSource = {
  serviceType: ServiceType.MISCELLANEOUS_AS_SERVICE,
  async load(ctx, from, to) {
    const items = await UnitMiscellaneousItem.findAll({
      where: {
        [Op.or]: [{ unitId: ctx.unitId }, ...(ctx.residentIds.length ? [{ residentId: ctx.residentIds }] : [])],
        isDeleted: false,
        serviceDate: { [Op.between]: [from, to] },
      },
    })
    return items
      .filter((item) => !isMovedAway(ctx, item.residentId, null))
      .map((item) => {
        const day = toDay(item.serviceDate) as string
        return usageLine(ServiceType.MISCELLANEOUS_AS_SERVICE, {
          sourceId: item.id,
          residentId: item.residentId,
          name: item.name,
          description: `${item.description ? `${item.description} ` : ''}(on ${day})`,
          quantity: Number(item.quantity),
          price: Number(item.price),
          total: roundMoney(Number(item.total)),
          serviceDate: day,
          fromUnitId: item.unitId,
        })
      })
  },
}

export const USAGE_SOURCES: UsageSource[] = [
  foodOrderSource,
  additionalTaskSource,
  doctorConsultationSource,
  labTestSource,
  inventoryItemSource,
  eventFeeSource,
  venueBookingSource,
  maintenanceSource,
  miscellaneousItemSource,
]
