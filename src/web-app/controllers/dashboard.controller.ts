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
} from '../../models/index.js'
import { CareLevel, ResidentStatus } from '../../enums/resident.enum.js'
import { OccupancyStatus, UnitStatus } from '../../enums/propertyUnit.enum.js'
import { InvoiceStatus } from '../../enums/billing.enum.js'
import { TicketPriority, TicketStatus } from '../../enums/ticket.enum.js'
import { AppointmentStatus } from '../../enums/appointment.enum.js'

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
      // ACTIVE RESIDENTS: Active & residing in community
      Resident.count({
        where: {
          ...residentWhere,
          status: ResidentStatus.ACTIVE,
          isResiding: true,
        },
      }),
      // TODAY'S ADMISSIONS: Moved in today
      Resident.count({
        where: {
          ...residentWhere,
          moveInDate: {
            [Op.gte]: startOfToday,
            [Op.lte]: endOfToday,
          },
        },
      }),
      // TODAY'S DISCHARGES: Moved out today
      Resident.count({
        where: {
          ...residentWhere,
          moveOutDate: {
            [Op.gte]: startOfToday,
            [Op.lte]: endOfToday,
          },
        },
      }),
      // TOTAL RESIDENTS: Total enrolled / active records
      Resident.count({
        where: residentWhere,
      }),
      // TOTAL OUT RESIDENTS: Active but temporarily out / not residing
      Resident.count({
        where: {
          ...residentWhere,
          isResiding: false,
          status: ResidentStatus.ACTIVE,
        },
      }),
      // REGISTERED & PRE-ASSESSED: Pending onboarding
      Resident.count({
        where: {
          ...residentWhere,
          status: ResidentStatus.PENDING,
        },
      }),
      // TOTAL DISCHARGED: MOVED_OUT status
      Resident.count({
        where: {
          ...residentWhere,
          status: ResidentStatus.MOVED_OUT,
        },
      }),
      // NOT ADMITTED: Pending without move-in date
      Resident.count({
        where: {
          ...residentWhere,
          status: ResidentStatus.PENDING,
          moveInDate: null,
        },
      }),
      // HOSPITALIZATION PENDING: Inactive & not residing
      Resident.count({
        where: {
          ...residentWhere,
          isResiding: false,
          status: ResidentStatus.INACTIVE,
        },
      }),
      // Acuity breakdown among active residing residents
      Resident.count({
        where: {
          ...residentWhere,
          status: ResidentStatus.ACTIVE,
          isResiding: true,
          [Op.or]: [{ careLevel: CareLevel.STABLE }, { careLevel: null }],
        },
      }),
      Resident.count({
        where: {
          ...residentWhere,
          status: ResidentStatus.ACTIVE,
          isResiding: true,
          careLevel: CareLevel.MODERATE,
        },
      }),
      Resident.count({
        where: {
          ...residentWhere,
          status: ResidentStatus.ACTIVE,
          isResiding: true,
          careLevel: CareLevel.CRITICAL,
        },
      }),
    ])

    // 2. Critical Residents List & Count (filtered by careLevel === CRITICAL)
    const criticalWhere: Record<string, unknown> = {
      ...residentWhere,
      status: ResidentStatus.ACTIVE,
      careLevel: CareLevel.CRITICAL,
    }

    const { count: criticalCount, rows: criticalRows } = await Resident.findAndCountAll({
      where: criticalWhere,
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          required: false,
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit,
      offset,
    })

    const criticalResidents = criticalRows.map((r) => {
      const roomStr = r.unit?.unit_number ? `Room ${r.unit.unit_number}` : 'Room unassigned'
      return {
        id: r.id,
        name: `${r.firstName} ${r.lastName || ''}`.trim(),
        room: roomStr,
        status: 'Patient in critical condition',
        condition: 'CRITICAL',
        careLevel: r.careLevel || 'CRITICAL',
        photoUrl: r.photoUrl || null,
        gender: r.gender || null,
      }
    })

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
          include: [
            {
              model: PropertyBlock,
              as: 'block',
              required: true,
              where: { propertyId: locId },
            },
          ],
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
            include: [
              {
                model: PropertyBlock,
                as: 'block',
                required: true,
                where: { propertyId: locId },
              },
            ],
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
      if (u.occupancyStatus === OccupancyStatus.OWNER_OCCUPIED) {
        ownerOccupied++
      } else if (u.occupancyStatus === OccupancyStatus.TENANT_OCCUPIED) {
        tenantOccupied++
      } else {
        vacantRooms++
      }

      if (u.status === UnitStatus.BOOKED || u.status === UnitStatus.ON_HOLD) {
        bookedRooms++
      }

      const typeKey = (u.unit_type || 'Other').toUpperCase()
      unitTypeBreakdown[typeKey] = (unitTypeBreakdown[typeKey] || 0) + 1
    }

    const occupiedRooms = ownerOccupied + tenantOccupied
    const availableVacancies = vacantRooms
    const occupancyRate = totalRooms > 0 ? Number(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0

    // 4. Monthly Revenue & Billing Summary
    const invoiceWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') {
      invoiceWhere.propertyId = locId
    }

    const packageSubWhere: Record<string, unknown> = {
      isDeleted: false,
      status: 'ACTIVE',
    }
    if (locId && locId !== 'ALL') {
      packageSubWhere.propertyId = locId
    }

    const [invoicesAgg, activeCareSubscriptions, activeFnbPackagesCount] = await Promise.all([
      Invoice.findAll({
        where: invoiceWhere,
        attributes: ['amountPaid', 'amountDue', 'grandTotal', 'status'],
      }),
      PackageSubscription.findAll({
        where: packageSubWhere,
        attributes: ['id', 'totalCost'],
      }),
      FnbResidentPackage.count({
        where: {
          status: 'active',
        },
      }),
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

      if (inv.status === InvoiceStatus.PAID) {
        paidCount++
      } else if (inv.status === InvoiceStatus.PARTIALLY_PAID) {
        partiallyPaidCount++
      } else if (inv.status === InvoiceStatus.OVERDUE) {
        overdueCount++
        overdueAmount += due
      } else if (inv.status === InvoiceStatus.SENT || inv.status === InvoiceStatus.FINALIZED) {
        sentCount++
      } else if (inv.status === InvoiceStatus.DRAFT || inv.status === InvoiceStatus.PREVIEW) {
        draftCount++
      }
    }

    const pendingInvoicesCount = invoicesAgg.filter((inv) =>
      [InvoiceStatus.FINALIZED, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE].includes(
        inv.status,
      ),
    ).length

    const collectionEfficiency =
      grandTotalSum > 0 ? Math.min(100, Math.round((totalCollected / grandTotalSum) * 100)) : 0

    let totalSubscriptionRecurring = 0
    for (const sub of activeCareSubscriptions) {
      totalSubscriptionRecurring += Number(sub.totalCost || 0)
    }

    // 5. Inventory Stock Status
    const inventoryWhere: Record<string, unknown> = {}
    if (locId && locId !== 'ALL') {
      inventoryWhere.locationId = locId
    }

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
      InventoryItemLocation.count({
        where: inventoryWhere,
      }),
      InventoryVendorLocation.count({
        where: inventoryWhere,
      }),
      InventoryStock.count({
        where: {
          ...inventoryWhere,
          quantity: { [Op.lte]: 0 },
        },
      }),
      InventoryStock.findAll({
        where: inventoryWhere,
        attributes: ['quantity'],
      }),
      InventoryCategoryLocation.count({
        where: inventoryWhere,
      }),
      InventoryPurchaseOrder.count({
        where: inventoryWhere,
      }),
      InventoryPurchaseOrder.count({
        where: {
          ...inventoryWhere,
          status: { [Op.in]: ['approval_pending', 'draft', 'pending'] },
        },
      }),
      InventoryStockTransaction.count({
        where: {
          ...inventoryWhere,
          transactionType: 'issue',
        },
      }),
      InventoryStockTransaction.count({
        where: {
          ...inventoryWhere,
          transactionType: 'purchase',
        },
      }),
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
    if (locId && locId !== 'ALL') {
      careTaskWhere.propertyId = locId
    }

    const [activeCareAssignments, completedCareTasksToday] = await Promise.all([
      CareTaskAssignment.count({
        where: {
          ...careTaskWhere,
          status: 'ACTIVE',
          isActive: true,
        },
      }),
      ResidentCareTaskCompletion.count({
        where: {
          ...careTaskWhere,
          completedAt: {
            [Op.gte]: startOfToday,
            [Op.lte]: endOfToday,
          },
        },
      }),
    ])

    // 7. Maintenance & Service Tickets Overview
    const ticketWhere: Record<string, unknown> = {}
    if (locId && locId !== 'ALL') {
      ticketWhere.locId = locId
    }

    const [openTicketsCount, criticalTicketsCount, resolvedTicketsToday] = await Promise.all([
      Ticket.count({
        where: {
          ...ticketWhere,
          status: {
            [Op.in]: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
          },
        },
      }),
      Ticket.count({
        where: {
          ...ticketWhere,
          status: {
            [Op.in]: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
          },
          priority: {
            [Op.in]: [TicketPriority.CRITICAL, TicketPriority.URGENT],
          },
        },
      }),
      Ticket.count({
        where: {
          ...ticketWhere,
          status: TicketStatus.RESOLVED,
          updatedAt: {
            [Op.gte]: startOfToday,
            [Op.lte]: endOfToday,
          },
        },
      }),
    ])

    // 8. Clinical Doctor Appointments Overview
    const appointmentWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') {
      appointmentWhere.locationId = locId
    }

    const [todayAppointmentsCount, todayPendingAppointmentsCount] = await Promise.all([
      DoctorAppointment.count({
        where: {
          ...appointmentWhere,
          appointmentDate: todayDateString,
        },
      }),
      DoctorAppointment.count({
        where: {
          ...appointmentWhere,
          appointmentDate: todayDateString,
          status: {
            [Op.in]: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
          },
        },
      }),
    ])

    res.status(200).json({
      success: true,
      data: {
        residentStatus: {
          activeResidents,
          todayAdmissions,
          todayDischarges,
          totalResidents,
          totalOutResidents,
          registeredPreAssessed,
          totalDischarged,
          notAdmitted,
          hospitalizationPending,
          careLevelBreakdown: {
            stable: stableResidentsCount,
            moderate: moderateResidentsCount,
            critical: criticalResidentsAcuityCount,
          },
        },
        criticalResidents: {
          total: criticalCount,
          page,
          limit,
          totalPages: Math.ceil(criticalCount / limit) || 1,
          items: criticalResidents,
        },
        occupancy: {
          totalRooms,
          occupiedRooms,
          availableVacancies,
          occupancyRate,
          totalBlocks,
          totalFloors,
          residingResidents: activeResidents,
          statusBreakdown: {
            ownerOccupied,
            tenantOccupied,
            vacant: vacantRooms,
            booked: bookedRooms,
          },
          unitTypeBreakdown,
        },
        billing: {
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
        },
        inventory: {
          totalStockedItems,
          stockReorderAlerts,
          approvedSuppliers,
          totalCategories,
          totalQuantityUnits,
          inStockItemsCount,
          purchaseOrders: {
            total: totalPurchaseOrders,
            pending: pendingPurchaseOrders,
          },
          transactions: {
            totalIssues,
            totalReceipts,
          },
        },
        careTasks: {
          activeAssignments: activeCareAssignments,
          completedToday: completedCareTasksToday,
        },
        tickets: {
          open: openTicketsCount,
          criticalUrgent: criticalTicketsCount,
          resolvedToday: resolvedTicketsToday,
        },
        clinical: {
          todayTotal: todayAppointmentsCount,
          todayPending: todayPendingAppointmentsCount,
        },
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch dashboard stats'
    res.status(500).json({ success: false, message })
  }
}
