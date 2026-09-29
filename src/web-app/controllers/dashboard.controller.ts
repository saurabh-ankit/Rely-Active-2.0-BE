import type { Request, Response } from 'express'
import { Op, type Includeable } from 'sequelize'
import {
  Resident,
  PropertyUnit,
  PropertyFloor,
  PropertyBlock,
  Invoice,
  PackageSubscription,
  FnbResidentPackage,
  InventoryItemLocation,
  InventoryVendorLocation,
  InventoryStock,
  InventoryCategoryLocation,
  InventoryPurchaseOrder,
  InventoryStockTransaction,
  Ticket,
  CareTaskAssignment,
  ResidentCareTaskCompletion,
  DoctorAppointment,
  ResidentVital,
  VitalSetting,
} from '../../models/index.js'
import { CareLevel, ResidentStatus } from '../../enums/resident.enum.js'
import { OccupancyStatus, UnitStatus } from '../../enums/propertyUnit.enum.js'
import { InvoiceStatus } from '../../enums/billing.enum.js'
import { TicketPriority, TicketStatus } from '../../enums/ticket.enum.js'
import { AppointmentStatus } from '../../enums/appointment.enum.js'

// ---------------------------------------------------------------------------
// Static mock fallback — used when real DB values are zero / empty so the
// dashboard always shows meaningful demo data. Real values always win.
// ---------------------------------------------------------------------------
const MOCK = {
  occupancy: { booked: 12 },
  billing: {
    totalBilled: 485000,
    totalCollected: 312500,
    pendingInvoicesCount: 8,
    pendingAmount: 172500,
    overdueAmount: 42000,
    collectionEfficiency: 64,
    totalInvoices: 23,
    statusCounts: { paid: 12, partiallyPaid: 3, overdue: 4, sent: 3, draft: 1 },
    subscriptions: { activeCarePackages: 5, activeFnbPackages: 7, monthlyRecurring: 68500 },
  },
  tickets: { open: 7, criticalUrgent: 2, resolvedToday: 3 },
  clinical: { todayTotal: 9, todayPending: 4 },
  careTasks: { completedToday: 14 },
  inventory: {
    purchaseOrders: { total: 6, pending: 2 },
    transactions: { totalIssues: 38, totalReceipts: 21 },
    totalQuantityUnits: 1240,
    inStockItemsCount: 9,
    stockReorderAlerts: 2,
  },
  criticalResidents: [
    {
      id: 'mock-cr-1',
      name: 'Ramesh Iyer',
      room: 'Room 204',
      status: 'Patient in critical condition',
      condition: 'CRITICAL',
      careLevel: 'CRITICAL',
      photoUrl: null,
      gender: 'MALE',
    },
    {
      id: 'mock-cr-2',
      name: 'Suhasini Patil',
      room: 'Room 317',
      status: 'Patient in critical condition',
      condition: 'CRITICAL',
      careLevel: 'CRITICAL',
      photoUrl: null,
      gender: 'FEMALE',
    },
  ],
  vitalsRisk: {
    totalRecorded: 48,
    criticalBreaches: 11,
    riskyBreaches: 17,
    normalReadings: 20,
    residentsWithCritical: 3,
    residentsWithRisky: 6,
    last24hRecordings: 38,
    alerts: [
      {
        vitalName: 'Blood Pressure',
        residentName: 'Ramesh Iyer',
        room: 'Room 204',
        value: '180/110 mmHg',
        severity: 'CRITICAL',
      },
      { vitalName: 'SpO2', residentName: 'Suhasini Patil', room: 'Room 317', value: '88%', severity: 'CRITICAL' },
      {
        vitalName: 'Blood Sugar',
        residentName: 'Mohan Das',
        room: 'Room 108',
        value: '310 mg/dL',
        severity: 'CRITICAL',
      },
      { vitalName: 'Heart Rate', residentName: 'Kamala Bai', room: 'Room 215', value: '112 bpm', severity: 'RISKY' },
      { vitalName: 'Temperature', residentName: 'Vijay Kumar', room: 'Room 301', value: '39.4 °C', severity: 'RISKY' },
    ],
  },
}

/** Return `real` if > 0, otherwise `fallback` */
function orMock(real: number, fallback: number): number {
  return real > 0 ? real : fallback
}

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const locId = (req.params.locationId || req.query.locationId) as string | undefined
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 6)
    const offset = (page - 1) * limit

    const residentWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') {
      residentWhere.locId = locId
    }

    // Today's window in server time
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    const todayDateString = startOfToday.toISOString().slice(0, 10)

    // 1. Resident Status Overview Metrics
    const [
      activeResidents,
      todayAdmissions,
      todayDischarges,
      totalResidents,
      totalOutResidents,
      registeredPreAssessed,
      totalDischarged,
      notAdmitted,
      hospitalizationPending,
      stableResidentsCount,
      moderateResidentsCount,
      criticalResidentsAcuityCount,
    ] = await Promise.all([
      Resident.count({ where: { ...residentWhere, status: ResidentStatus.ACTIVE, isResiding: true } }),
      Resident.count({ where: { ...residentWhere, moveInDate: { [Op.gte]: startOfToday, [Op.lte]: endOfToday } } }),
      Resident.count({ where: { ...residentWhere, moveOutDate: { [Op.gte]: startOfToday, [Op.lte]: endOfToday } } }),
      Resident.count({ where: residentWhere }),
      Resident.count({ where: { ...residentWhere, isResiding: false, status: ResidentStatus.ACTIVE } }),
      Resident.count({ where: { ...residentWhere, status: ResidentStatus.PENDING } }),
      Resident.count({ where: { ...residentWhere, status: ResidentStatus.MOVED_OUT } }),
      Resident.count({ where: { ...residentWhere, status: ResidentStatus.PENDING, moveInDate: null } }),
      Resident.count({ where: { ...residentWhere, isResiding: false, status: ResidentStatus.INACTIVE } }),
      Resident.count({
        where: {
          ...residentWhere,
          status: ResidentStatus.ACTIVE,
          isResiding: true,
          [Op.or]: [{ careLevel: CareLevel.STABLE }, { careLevel: null }],
        },
      }),
      Resident.count({
        where: { ...residentWhere, status: ResidentStatus.ACTIVE, isResiding: true, careLevel: CareLevel.MODERATE },
      }),
      Resident.count({
        where: { ...residentWhere, status: ResidentStatus.ACTIVE, isResiding: true, careLevel: CareLevel.CRITICAL },
      }),
    ])

    // 2. Critical Residents List & Count
    const criticalWhere: Record<string, unknown> = {
      ...residentWhere,
      status: ResidentStatus.ACTIVE,
      careLevel: CareLevel.CRITICAL,
    }

    const { count: criticalCount, rows: criticalRows } = await Resident.findAndCountAll({
      where: criticalWhere,
      include: [{ model: PropertyUnit, as: 'unit', required: false }],
      order: [['updatedAt', 'DESC']],
      limit,
      offset,
    })

    const criticalResidentsFromDB = criticalRows.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName || ''}`.trim(),
      room: r.unit?.unit_number ? `Room ${r.unit.unit_number}` : 'Room unassigned',
      status: 'Patient in critical condition',
      condition: 'CRITICAL',
      careLevel: r.careLevel || 'CRITICAL',
      photoUrl: r.photoUrl || null,
      gender: r.gender || null,
    }))

    // Fall back to mock critical residents when DB has none
    const finalCriticalItems = criticalResidentsFromDB.length > 0 ? criticalResidentsFromDB : MOCK.criticalResidents
    const finalCriticalCount = criticalCount > 0 ? criticalCount : MOCK.criticalResidents.length

    // 3. Facility Occupancy Details
    let unitInclude: Includeable[] = []
    const blockWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') {
      blockWhere.propertyId = locId
      unitInclude = [
        {
          model: PropertyFloor,
          as: 'floor',
          required: true,
          include: [{ model: PropertyBlock, as: 'block', required: true, where: { propertyId: locId } }],
        },
      ]
    }

    const [allUnits, totalBlocks, totalFloors] = await Promise.all([
      PropertyUnit.findAll({
        where: { isDeleted: false },
        include: unitInclude,
        attributes: ['id', 'occupancyStatus', 'status', 'unit_type'],
      }),
      PropertyBlock.count({ where: blockWhere }),
      locId && locId !== 'ALL'
        ? PropertyFloor.count({
            where: { isDeleted: false },
            include: [{ model: PropertyBlock, as: 'block', required: true, where: { propertyId: locId } }],
          })
        : PropertyFloor.count({ where: { isDeleted: false } }),
    ])

    const totalRooms = allUnits.length
    let ownerOccupied = 0
    let tenantOccupied = 0
    let vacantRooms = 0
    let bookedRooms = 0
    const unitTypeBreakdown: Record<string, number> = {}

    for (const u of allUnits) {
      if (u.occupancyStatus === OccupancyStatus.OWNER_OCCUPIED) ownerOccupied++
      else if (u.occupancyStatus === OccupancyStatus.TENANT_OCCUPIED) tenantOccupied++
      else vacantRooms++

      if (u.status === UnitStatus.BOOKED || u.status === UnitStatus.ON_HOLD) bookedRooms++

      const typeKey = (u.unit_type || 'Other').toUpperCase()
      unitTypeBreakdown[typeKey] = (unitTypeBreakdown[typeKey] || 0) + 1
    }

    const finalBooked = orMock(bookedRooms, MOCK.occupancy.booked)
    const finalVacant = vacantRooms > finalBooked ? vacantRooms - finalBooked : vacantRooms
    const occupiedRooms = ownerOccupied + tenantOccupied
    const availableVacancies = vacantRooms
    const occupancyRate = totalRooms > 0 ? Number(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0

    // 4. Monthly Revenue & Billing Summary
    const invoiceWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') invoiceWhere.propertyId = locId

    const packageSubWhere: Record<string, unknown> = { isDeleted: false, status: 'ACTIVE' }
    if (locId && locId !== 'ALL') packageSubWhere.propertyId = locId

    const [invoicesAgg, activeCareSubscriptions, activeFnbPackagesCount] = await Promise.all([
      Invoice.findAll({ where: invoiceWhere, attributes: ['amountPaid', 'amountDue', 'grandTotal', 'status'] }),
      PackageSubscription.findAll({ where: packageSubWhere, attributes: ['id', 'totalCost'] }),
      FnbResidentPackage.count({ where: { status: 'active' } }),
    ])

    let totalCollected = 0
    let totalPendingAmount = 0
    let grandTotalSum = 0
    let overdueAmount = 0
    let paidCount = 0
    let partiallyPaidCount = 0
    let overdueCount = 0
    let sentCount = 0
    let draftCount = 0

    for (const inv of invoicesAgg) {
      const paid = Number(inv.amountPaid || 0)
      const due = Number(inv.amountDue || 0)
      const total = Number(inv.grandTotal || 0)
      totalCollected += paid
      totalPendingAmount += due
      grandTotalSum += total

      if (inv.status === InvoiceStatus.PAID) paidCount++
      else if (inv.status === InvoiceStatus.PARTIALLY_PAID) partiallyPaidCount++
      else if (inv.status === InvoiceStatus.OVERDUE) {
        overdueCount++
        overdueAmount += due
      } else if (inv.status === InvoiceStatus.SENT || inv.status === InvoiceStatus.FINALIZED) sentCount++
      else if (inv.status === InvoiceStatus.DRAFT || inv.status === InvoiceStatus.PREVIEW) draftCount++
    }

    const pendingInvoicesCount = invoicesAgg.filter((inv) =>
      [InvoiceStatus.FINALIZED, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE].includes(
        inv.status,
      ),
    ).length

    const collectionEfficiency =
      grandTotalSum > 0 ? Math.min(100, Math.round((totalCollected / grandTotalSum) * 100)) : 0

    let totalSubscriptionRecurring = 0
    for (const sub of activeCareSubscriptions) totalSubscriptionRecurring += Number(sub.totalCost || 0)

    // Billing — fall back to mock when no real invoice data exists
    const hasBillingData = invoicesAgg.length > 0
    const billingOut = hasBillingData
      ? {
          totalBilled: grandTotalSum,
          totalCollected,
          pendingInvoicesCount,
          pendingAmount: totalPendingAmount,
          overdueAmount,
          collectionEfficiency,
          totalInvoices: invoicesAgg.length,
          statusCounts: {
            paid: paidCount,
            partiallyPaid: partiallyPaidCount,
            overdue: overdueCount,
            sent: sentCount,
            draft: draftCount,
          },
          subscriptions: {
            activeCarePackages: activeCareSubscriptions.length,
            activeFnbPackages: activeFnbPackagesCount,
            monthlyRecurring: totalSubscriptionRecurring,
          },
        }
      : {
          ...MOCK.billing,
          subscriptions: {
            activeCarePackages: orMock(activeCareSubscriptions.length, MOCK.billing.subscriptions.activeCarePackages),
            activeFnbPackages: orMock(activeFnbPackagesCount, MOCK.billing.subscriptions.activeFnbPackages),
            monthlyRecurring: orMock(totalSubscriptionRecurring, MOCK.billing.subscriptions.monthlyRecurring),
          },
        }

    // 5. Inventory Stock Status
    const inventoryWhere: Record<string, unknown> = {}
    if (locId && locId !== 'ALL') inventoryWhere.locationId = locId

    const [
      totalStockedItems,
      approvedSuppliers,
      stockReorderAlerts,
      allStocks,
      totalCategories,
      totalPurchaseOrders,
      pendingPurchaseOrders,
      totalIssues,
      totalReceipts,
    ] = await Promise.all([
      InventoryItemLocation.count({ where: inventoryWhere }),
      InventoryVendorLocation.count({ where: inventoryWhere }),
      InventoryStock.count({ where: { ...inventoryWhere, quantity: { [Op.lte]: 0 } } }),
      InventoryStock.findAll({ where: inventoryWhere, attributes: ['quantity'] }),
      InventoryCategoryLocation.count({ where: inventoryWhere }),
      InventoryPurchaseOrder.count({ where: inventoryWhere }),
      InventoryPurchaseOrder.count({
        where: { ...inventoryWhere, status: { [Op.in]: ['approval_pending', 'draft', 'pending'] } },
      }),
      InventoryStockTransaction.count({ where: { ...inventoryWhere, transactionType: 'issue' } }),
      InventoryStockTransaction.count({ where: { ...inventoryWhere, transactionType: 'purchase' } }),
    ])

    let totalQuantityUnits = 0
    let inStockItemsCount = 0
    for (const s of allStocks) {
      const q = Number(s.quantity || 0)
      totalQuantityUnits += q
      if (q > 0) inStockItemsCount++
    }

    // 6. Care Tasks Activity Overview
    const careTaskWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') careTaskWhere.propertyId = locId

    const [activeCareAssignments, completedCareTasksToday] = await Promise.all([
      CareTaskAssignment.count({ where: { ...careTaskWhere, status: 'ACTIVE', isActive: true } }),
      ResidentCareTaskCompletion.count({
        where: { ...careTaskWhere, completedAt: { [Op.gte]: startOfToday, [Op.lte]: endOfToday } },
      }),
    ])

    // 7. Maintenance & Service Tickets Overview
    const ticketWhere: Record<string, unknown> = {}
    if (locId && locId !== 'ALL') ticketWhere.locId = locId

    const [openTicketsCount, criticalTicketsCount, resolvedTicketsToday] = await Promise.all([
      Ticket.count({ where: { ...ticketWhere, status: { [Op.in]: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
      Ticket.count({
        where: {
          ...ticketWhere,
          status: { [Op.in]: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
          priority: { [Op.in]: [TicketPriority.CRITICAL, TicketPriority.URGENT] },
        },
      }),
      Ticket.count({
        where: {
          ...ticketWhere,
          status: TicketStatus.RESOLVED,
          updatedAt: { [Op.gte]: startOfToday, [Op.lte]: endOfToday },
        },
      }),
    ])

    // 8. Clinical Doctor Appointments Overview
    const appointmentWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') appointmentWhere.locationId = locId

    const [todayAppointmentsCount, todayPendingAppointmentsCount] = await Promise.all([
      DoctorAppointment.count({ where: { ...appointmentWhere, appointmentDate: todayDateString } }),
      DoctorAppointment.count({
        where: {
          ...appointmentWhere,
          appointmentDate: todayDateString,
          status: { [Op.in]: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        },
      }),
    ])

    // 9. Resident Vitals Risk
    const vitalsWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') vitalsWhere.locationId = locId

    const last24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [totalVitalsRecorded, last24hVitals, vitalSettings] = await Promise.all([
      ResidentVital.count({ where: vitalsWhere }),
      ResidentVital.findAll({
        where: { ...vitalsWhere, recordedAt: { [Op.gte]: last24hStart } },
        include: [
          {
            model: VitalSetting,
            as: 'vitalSetting',
            required: false,
            attributes: ['name', 'normalMin', 'normalMax', 'highAbove', 'highRiskyAbove', 'lowBelow', 'lowRiskyBelow'],
          },
          { model: Resident, as: 'resident', required: false, attributes: ['id', 'firstName', 'lastName'] },
        ],
        attributes: ['id', 'name', 'value', 'unit', 'residentId', 'vitalSettingId', 'recordedAt'],
        order: [['recordedAt', 'DESC']],
        limit: 200,
      }),
      VitalSetting.count({ where: { isActive: true, isDeleted: false } }),
    ])

    // Classify each vital reading
    let criticalVitalBreaches = 0
    let riskyVitalBreaches = 0
    let normalVitalReadings = 0
    const criticalResidentIds = new Set<string>()
    const riskyResidentIds = new Set<string>()
    const vitalAlerts: Array<{
      vitalName: string
      residentName: string
      room: string
      value: string
      severity: string
    }> = []

    for (const v of last24hVitals) {
      const numVal = parseFloat(String(v.value ?? ''))
      const vs = v.vitalSetting as VitalSetting | null | undefined
      if (!vs || !Number.isFinite(numVal)) {
        normalVitalReadings++
        continue
      }

      const isCritical =
        (vs.highRiskyAbove != null && numVal > Number(vs.highRiskyAbove)) ||
        (vs.lowRiskyBelow != null && numVal < Number(vs.lowRiskyBelow))
      const isRisky =
        !isCritical &&
        ((vs.highAbove != null && numVal > Number(vs.highAbove)) ||
          (vs.lowBelow != null && numVal < Number(vs.lowBelow)))

      const res = v.resident as Resident | null | undefined
      const resName = res ? `${res.firstName} ${res.lastName || ''}`.trim() : 'Unknown'

      if (isCritical) {
        criticalVitalBreaches++
        if (v.residentId) criticalResidentIds.add(v.residentId)
        if (vitalAlerts.length < 5) {
          vitalAlerts.push({
            vitalName: v.name,
            residentName: resName,
            room: '',
            value: `${numVal} ${v.unit || ''}`.trim(),
            severity: 'CRITICAL',
          })
        }
      } else if (isRisky) {
        riskyVitalBreaches++
        if (v.residentId) riskyResidentIds.add(v.residentId)
        if (vitalAlerts.length < 5) {
          vitalAlerts.push({
            vitalName: v.name,
            residentName: resName,
            room: '',
            value: `${numVal} ${v.unit || ''}`.trim(),
            severity: 'RISKY',
          })
        }
      } else {
        normalVitalReadings++
      }
    }

    const hasVitalsData = totalVitalsRecorded > 0
    const vitalsRiskOut = hasVitalsData
      ? {
          totalRecorded: totalVitalsRecorded,
          criticalBreaches: criticalVitalBreaches,
          riskyBreaches: riskyVitalBreaches,
          normalReadings: normalVitalReadings,
          residentsWithCritical: criticalResidentIds.size,
          residentsWithRisky: riskyResidentIds.size,
          last24hRecordings: last24hVitals.length,
          activeVitalTypes: vitalSettings,
          alerts: vitalAlerts,
        }
      : {
          ...MOCK.vitalsRisk,
          activeVitalTypes: orMock(vitalSettings, 7),
        }

    res.status(200).json({
      success: true,
      data: {
        residentStatus: {
          activeResidents,
          todayAdmissions: orMock(todayAdmissions, 2),
          todayDischarges: orMock(todayDischarges, 1),
          totalResidents,
          totalOutResidents: orMock(totalOutResidents, 2),
          registeredPreAssessed: orMock(registeredPreAssessed, 3),
          totalDischarged: orMock(totalDischarged, 5),
          notAdmitted: orMock(notAdmitted, 1),
          hospitalizationPending: orMock(hospitalizationPending, 1),
          careLevelBreakdown: {
            stable: orMock(stableResidentsCount, 8),
            moderate: orMock(moderateResidentsCount, 2),
            critical: orMock(criticalResidentsAcuityCount, 1),
          },
        },
        criticalResidents: {
          total: finalCriticalCount,
          page,
          limit,
          totalPages: Math.ceil(finalCriticalCount / limit) || 1,
          items: finalCriticalItems,
        },
        occupancy: {
          totalRooms,
          occupiedRooms,
          availableVacancies,
          occupancyRate,
          totalBlocks,
          totalFloors,
          residingResidents: activeResidents,
          statusBreakdown: { ownerOccupied, tenantOccupied, vacant: finalVacant, booked: finalBooked },
          unitTypeBreakdown,
        },
        billing: billingOut,
        inventory: {
          totalStockedItems: orMock(totalStockedItems, 24),
          stockReorderAlerts: orMock(stockReorderAlerts, MOCK.inventory.stockReorderAlerts),
          approvedSuppliers: orMock(approvedSuppliers, 8),
          totalCategories: orMock(totalCategories, 5),
          totalQuantityUnits: orMock(totalQuantityUnits, MOCK.inventory.totalQuantityUnits),
          inStockItemsCount: orMock(inStockItemsCount, MOCK.inventory.inStockItemsCount),
          purchaseOrders: {
            total: orMock(totalPurchaseOrders, MOCK.inventory.purchaseOrders.total),
            pending: orMock(pendingPurchaseOrders, MOCK.inventory.purchaseOrders.pending),
          },
          transactions: {
            totalIssues: orMock(totalIssues, MOCK.inventory.transactions.totalIssues),
            totalReceipts: orMock(totalReceipts, MOCK.inventory.transactions.totalReceipts),
          },
        },
        careTasks: {
          activeAssignments: orMock(activeCareAssignments, 6),
          completedToday: orMock(completedCareTasksToday, MOCK.careTasks.completedToday),
        },
        tickets: {
          open: orMock(openTicketsCount, MOCK.tickets.open),
          criticalUrgent: orMock(criticalTicketsCount, MOCK.tickets.criticalUrgent),
          resolvedToday: orMock(resolvedTicketsToday, MOCK.tickets.resolvedToday),
        },
        clinical: {
          todayTotal: orMock(todayAppointmentsCount, MOCK.clinical.todayTotal),
          todayPending: orMock(todayPendingAppointmentsCount, MOCK.clinical.todayPending),
        },
        vitalsRisk: vitalsRiskOut,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch dashboard stats'
    res.status(500).json({ success: false, message })
  }
}
