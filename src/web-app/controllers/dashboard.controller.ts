import type { Request, Response } from 'express'
import { Op, type Includeable } from 'sequelize'
import {
  Resident,
  PropertyUnit,
  PropertyFloor,
  PropertyBlock,
  Invoice,
  InventoryItemLocation,
  InventoryVendorLocation,
} from '../../models/index.js'
import { ResidentStatus } from '../../enums/resident.enum.js'
import { OccupancyStatus } from '../../enums/propertyUnit.enum.js'
import { InvoiceStatus } from '../../enums/billing.enum.js'

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
    ])

    // 2. Critical Residents List & Count
    const criticalWhere: Record<string, unknown> = {
      ...residentWhere,
      status: ResidentStatus.ACTIVE,
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
      }
    })

    // 3. Facility Occupancy Details
    let unitInclude: Includeable[] = []
    if (locId && locId !== 'ALL') {
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

    const [totalRooms, occupiedRooms] = await Promise.all([
      PropertyUnit.count({
        where: { isDeleted: false },
        include: unitInclude,
      }),
      PropertyUnit.count({
        where: {
          isDeleted: false,
          occupancyStatus: {
            [Op.in]: [OccupancyStatus.OWNER_OCCUPIED, OccupancyStatus.TENANT_OCCUPIED],
          },
        },
        include: unitInclude,
      }),
    ])

    const availableVacancies = Math.max(0, totalRooms - occupiedRooms)
    const occupancyRate = totalRooms > 0 ? Number(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0

    // 4. Monthly Revenue & Billing Summary
    const invoiceWhere: Record<string, unknown> = { isDeleted: false }
    if (locId && locId !== 'ALL') {
      invoiceWhere.propertyId = locId
    }

    const [invoicesAgg, pendingInvoicesCount] = await Promise.all([
      Invoice.findAll({
        where: invoiceWhere,
        attributes: ['amountPaid', 'amountDue', 'grandTotal'],
      }),
      Invoice.count({
        where: {
          ...invoiceWhere,
          status: {
            [Op.in]: [InvoiceStatus.FINALIZED, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
          },
        },
      }),
    ])

    let totalCollected = 0
    let totalPendingAmount = 0
    let grandTotalSum = 0
    for (const inv of invoicesAgg) {
      totalCollected += Number(inv.amountPaid || 0)
      totalPendingAmount += Number(inv.amountDue || 0)
      grandTotalSum += Number(inv.grandTotal || 0)
    }

    const collectionEfficiency =
      grandTotalSum > 0 ? Math.min(100, Math.round((totalCollected / grandTotalSum) * 100)) : 0

    // 5. Inventory Stock Status
    const inventoryWhere: Record<string, unknown> = {}
    if (locId && locId !== 'ALL') {
      inventoryWhere.locationId = locId
    }

    const [totalStockedItems, approvedSuppliers] = await Promise.all([
      InventoryItemLocation.count({
        where: inventoryWhere,
      }),
      InventoryVendorLocation.count({
        where: inventoryWhere,
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
        },
        billing: {
          totalCollected,
          pendingInvoicesCount,
          pendingAmount: totalPendingAmount,
          collectionEfficiency,
        },
        inventory: {
          totalStockedItems,
          stockReorderAlerts: 0,
          approvedSuppliers,
        },
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch dashboard stats'
    res.status(500).json({ success: false, message })
  }
}
