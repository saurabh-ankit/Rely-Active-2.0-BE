import { Response } from 'express'
import { Op } from 'sequelize'
import { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  Invoice,
  ServicesInvoice,
  Receipt,
  MiscellaneousBilling,
  UnitMiscellaneousItem,
  PropertyUnit,
  PropertyFloor,
  PropertyBlock,
  Resident,
  ResidentFamilyMember,
  PackageSubscription,
  Package,
  FnbResidentPackage,
  FnbPropertyPackage,
  FnbGlobalPackage,
  AdditionalTaskCharge,
  FnbResidentOrder,
  GstTaxSettings,
} from '../../models/index.js'
import { InvoiceStatus, PaymentMethod } from '../../models/invoice.model.js'
import { ServiceType } from '../../models/servicesInvoice.model.js'
import { logger } from '../../config/logger.js'

// Helper to format invoice numbers (e.g., INV-2026-0001)
const generateInvoiceNumber = async (): Promise<string> => {
  const count = await Invoice.count()
  const year = new Date().getFullYear()
  const numStr = String(count + 1).padStart(4, '0')
  return `INV-${year}-${numStr}`
}

// Helper to format receipt numbers (e.g., REC-2026-0001)
const generateReceiptNumber = async (): Promise<string> => {
  const count = await Receipt.count()
  const year = new Date().getFullYear()
  const numStr = String(count + 1).padStart(4, '0')
  return `REC-${year}-${numStr}`
}

/**
 * GET /api/v1/billing/units-summary
 * Returns occupied flats directory list with financial metrics calculated from invoices & receipts.
 */
export async function getUnitsBillingSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const targetPropertyId = (req.params.locationId || req.query.propertyId || req.query.locationId) as
      string | undefined

    const unitWhere: Record<string, unknown> = { isDeleted: false }
    const blockWhere: Record<string, unknown> = {}
    if (targetPropertyId && targetPropertyId !== 'ALL' && targetPropertyId !== 'all') {
      blockWhere.propertyId = String(targetPropertyId)
    }

    const units = await PropertyUnit.findAll({
      where: unitWhere,
      include: [
        {
          model: PropertyFloor,
          as: 'floor',
          required: true,
          include: [
            {
              model: PropertyBlock,
              as: 'block',
              required: Object.keys(blockWhere).length > 0,
              where: blockWhere,
            },
          ],
        },
        {
          model: Resident,
          as: 'residents',
          required: false,
          where: { isDeleted: false },
          attributes: [
            'id',
            'firstName',
            'lastName',
            'phone',
            'email',
            'photoUrl',
            'residentType',
            'isResiding',
            'moveInDate',
          ],
          include: [
            {
              model: ResidentFamilyMember,
              as: 'familyMembers',
              required: false,
              attributes: ['id', 'firstName', 'lastName', 'relation', 'isResiding', 'phone', 'email'],
            },
          ],
        },
        {
          model: Invoice,
          as: 'invoices',
          required: false,
          where: {
            status: { [Op.ne]: InvoiceStatus.CANCELLED },
          },
          include: [
            { model: ServicesInvoice, as: 'services' },
            { model: Receipt, as: 'receipts' },
          ],
        },
      ],
      order: [['unit_number', 'ASC']],
    })

    const summary = units.map((u) => {
      const uJson = u.toJSON() as unknown as Record<string, unknown>
      const allInvoices = (uJson.invoices as Array<Record<string, unknown>>) || []

      const totalInvoiced = allInvoices.reduce((acc, inv) => acc + Number(inv.total || 0), 0)
      const totalPaid = allInvoices.reduce((acc, inv) => acc + Number(inv.paidAmount || 0), 0)
      const totalOutstanding = allInvoices
        .filter((inv) => inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.CANCELLED)
        .reduce((acc, inv) => acc + Math.max(0, Number(inv.total || 0) - Number(inv.paidAmount || 0)), 0)

      // Extract residing residents and prioritize residing tenants over non-residing owners
      const residents = (uJson.residents as Array<Record<string, unknown>>) || []
      const allResidingResidents = residents.filter((r) => r.isResiding !== false)
      const hasResidingTenant = allResidingResidents.some((r) => r.residentType === 'TENANT')

      const targetResidents = hasResidingTenant
        ? allResidingResidents.filter((r) => r.residentType === 'TENANT')
        : allResidingResidents

      const mergedResidents: Array<Record<string, unknown>> = []
      for (const r of targetResidents) {
        mergedResidents.push({
          id: r.id,
          name: `${(r.firstName as string) || ''} ${(r.lastName as string) || ''}`.trim(),
          phone: r.phone,
          email: r.email,
          relationship: r.residentType || 'RESIDENT',
          residentType: r.residentType,
          isPrimary: Boolean(r.isResiding),
          isResiding: true,
          isFamilyMember: false,
          moveInDate: r.moveInDate || null,
        })

        const familyMembers = (r.familyMembers as Array<Record<string, unknown>>) || []
        for (const fm of familyMembers) {
          if (fm.isResiding !== false) {
            mergedResidents.push({
              id: fm.id,
              name: `${(fm.firstName as string) || ''} ${(fm.lastName as string) || ''}`.trim(),
              phone: fm.phone,
              email: fm.email,
              relationship: fm.relation || 'FAMILY_MEMBER',
              isPrimary: false,
              isResiding: true,
              isFamilyMember: true,
              parentResidentName: `${(r.firstName as string) || ''} ${(r.lastName as string) || ''}`.trim(),
            })
          }
        }
      }

      const primaryResident =
        mergedResidents.find((r) => r.isPrimary && !r.isFamilyMember) || mergedResidents[0] || null
      const rawOccupancy = (uJson.occupancyStatus as string) || 'VACANT'
      const isOccupied = rawOccupancy !== 'VACANT' || !!primaryResident
      const finalOccupancyStatus = isOccupied ? (rawOccupancy !== 'VACANT' ? rawOccupancy : 'OCCUPIED') : 'VACANT'
      const floorObj = uJson.floor as Record<string, unknown> | undefined
      const blockObj = floorObj?.block as Record<string, unknown> | undefined
      const flatMoveInDate =
        primaryResident?.moveInDate || mergedResidents.find((r) => r.moveInDate)?.moveInDate || null

      return {
        id: uJson.id,
        unitId: uJson.id,
        unitNumber: uJson.unit_number,
        unitType: uJson.unit_type,
        occupancyStatus: finalOccupancyStatus,
        floorNumber: floorObj?.floor_number,
        blockName: blockObj?.block_name,
        moveInDate: flatMoveInDate,
        residents: mergedResidents,
        primaryResident,
        primaryPayer: primaryResident ? { name: primaryResident.name, role: 'PRIMARY_PAYER' } : null,
        financialMetrics: {
          totalInvoiced,
          totalCollected: totalPaid,
          totalOutstanding,
          invoicesCount: allInvoices.length,
        },
      }
    })

    res.json({ success: true, data: summary })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch units billing summary')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * GET /api/v1/billing/units/:unitId/360
 * Returns flat unit 360 overview (invoices, services, receipts, and unbilled items).
 */
export async function getUnitBilling360(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const unitId = req.params.unitId as string
    if (!unitId) {
      res.status(400).json({ success: false, message: 'unitId is required' })
      return
    }

    const unit = await PropertyUnit.findByPk(unitId, {
      include: [
        {
          model: PropertyFloor,
          as: 'floor',
          include: [{ model: PropertyBlock, as: 'block' }],
        },
        {
          model: Resident,
          as: 'residents',
          where: { isDeleted: false },
          required: false,
          include: [
            {
              model: ResidentFamilyMember,
              as: 'familyMembers',
              required: false,
              attributes: ['id', 'firstName', 'lastName', 'relation', 'isResiding', 'phone', 'email'],
            },
          ],
        },
      ],
    })

    if (!unit) {
      res.status(404).json({ success: false, message: 'Unit not found' })
      return
    }

    const uJson = unit.toJSON() as unknown as Record<string, unknown>

    // Extract residing residents and family members
    const residents = (uJson.residents as Array<Record<string, unknown>>) || []
    const allResidingResidents = residents.filter((r) => r.isResiding !== false)
    const hasResidingTenant = allResidingResidents.some((r) => r.residentType === 'TENANT')
    const targetResidents = hasResidingTenant
      ? allResidingResidents.filter((r) => r.residentType === 'TENANT')
      : allResidingResidents

    const occupants: Array<Record<string, unknown>> = []
    const residentIds: string[] = []

    for (const r of targetResidents) {
      residentIds.push(r.id as string)
      occupants.push({
        id: r.id,
        name: `${(r.firstName as string) || ''} ${(r.lastName as string) || ''}`.trim(),
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        relationship: r.residentType || 'RESIDENT',
        residentType: r.residentType,
        isPrimary: Boolean(r.isResiding),
        isResiding: true,
        isFamilyMember: false,
        moveInDate: r.moveInDate || null,
      })

      const familyMembers = (r.familyMembers as Array<Record<string, unknown>>) || []
      for (const fm of familyMembers) {
        if (fm.isResiding !== false) {
          occupants.push({
            id: fm.id,
            name: `${(fm.firstName as string) || ''} ${(fm.lastName as string) || ''}`.trim(),
            firstName: fm.firstName,
            lastName: fm.lastName,
            email: fm.email,
            phone: fm.phone,
            relationship: fm.relation || 'FAMILY_MEMBER',
            isPrimary: false,
            isResiding: true,
            isFamilyMember: true,
            parentResidentName: `${(r.firstName as string) || ''} ${(r.lastName as string) || ''}`.trim(),
          })
        }
      }
    }

    const primaryResident = occupants.find((r) => r.isPrimary && !r.isFamilyMember) || occupants[0] || null

    // Fetch invoices for unit / resident
    const invoices = await Invoice.findAll({
      where: {
        [Op.or]: [{ unitId: unit.id }, { residentId: residentIds.length > 0 ? residentIds : undefined }],
      },
      include: [
        { model: ServicesInvoice, as: 'services' },
        { model: MiscellaneousBilling, as: 'miscellaneousItems' },
        { model: Receipt, as: 'receipts' },
      ],
      order: [['createdAt', 'DESC']],
    })

    // Fetch pending unbilled miscellaneous items (miscellaneous_at_services)
    const unbilledItems = await UnitMiscellaneousItem.findAll({
      where: {
        [Op.or]: [{ unitId: unit.id }, { residentId: residentIds.length > 0 ? residentIds : undefined }],
        isBilled: false,
      },
      order: [['date', 'DESC']],
    })

    // Fetch receipts for this unit/residents
    const receipts = await Receipt.findAll({
      where: {
        [Op.or]: [{ unitId: unit.id }, { residentId: residentIds.length > 0 ? residentIds : undefined }],
      },
      order: [['createdAt', 'DESC']],
    })

    // Extract family member IDs
    const familyMemberIds: string[] = []
    for (const r of targetResidents) {
      const familyMembers = (r.familyMembers as Array<Record<string, unknown>>) || []
      for (const fm of familyMembers) {
        if (fm.isResiding !== false) {
          familyMemberIds.push(fm.id as string)
        }
      }
    }

    // Fetch Food Package Subscriptions
    const fnbSubscriptions = await FnbResidentPackage.findAll({
      where: {
        [Op.or]: [
          ...(residentIds.length > 0 ? [{ residentId: residentIds }] : []),
          ...(familyMemberIds.length > 0 ? [{ familyMemberId: familyMemberIds }] : []),
        ],
        status: 'active',
      },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
        { model: Resident, as: 'resident' },
        { model: ResidentFamilyMember, as: 'familyMember' },
      ],
    })

    const fnbSubItems = fnbSubscriptions.map((fnb) => {
      const fnbJson = fnb.toJSON() as unknown as Record<string, unknown>
      const propPkg = fnbJson.propertyPackage as Record<string, unknown> | undefined
      const globalPkg = propPkg?.globalPackage as Record<string, unknown> | undefined
      const resObj = fnbJson.resident as Record<string, unknown> | undefined
      const fmObj = fnbJson.familyMember as Record<string, unknown> | undefined
      const pkgName = (globalPkg?.name as string) || 'Food Package'
      const price = Number(fnbJson.totalPrice || propPkg?.price || 0)
      const subscriberName = resObj
        ? `${resObj.firstName || ''} ${resObj.lastName || ''} (Primary Resident)`.trim()
        : fmObj
          ? `${fmObj.firstName || ''} ${fmObj.lastName || ''} (${fmObj.relation || 'Family Member'})`.trim()
          : 'Resident'
      return {
        id: fnbJson.id,
        description: `${subscriberName} - ${pkgName}`,
        billingFrequency: 'MONTHLY',
        unitPrice: price,
        amount: price,
        isActive: true,
        prorationPolicy: 'DAILY',
        startDate: fnbJson.startDate,
        endDate: fnbJson.endDate,
        product: {
          productName: `${subscriberName} - ${pkgName}`,
          productType: 'food_package',
        },
      }
    })

    // Fetch Care Package Subscriptions
    const packageSubscriptions =
      residentIds.length > 0
        ? await PackageSubscription.findAll({
            where: {
              residentId: residentIds,
              isDeleted: false,
              [Op.or]: [{ isActive: true }, { status: 'ACTIVE' }],
            },
            include: [{ model: Package, as: 'carePackage' }],
            order: [['createdAt', 'DESC']],
          })
        : []

    const careSubItems = packageSubscriptions.map((sub) => {
      const subJson = sub.toJSON() as unknown as Record<string, unknown>
      const pkg = subJson.carePackage as Record<string, unknown> | undefined
      const price = Number(pkg?.packageCost || subJson.totalCost || 0)
      const name = (pkg?.packageName as string) || (subJson.notes as string) || 'Subscribed Package'
      return {
        id: subJson.id,
        description: name,
        billingFrequency: 'MONTHLY',
        unitPrice: price,
        amount: price,
        isActive: true,
        prorationPolicy: 'DAILY',
        startDate: subJson.startDate,
        endDate: subJson.endDate,
        product: {
          productName: name,
          productType: 'food_package',
        },
      }
    })

    const subscriptions = [...fnbSubItems, ...careSubItems]
    const unitFloor = uJson.floor as Record<string, unknown> | undefined
    const unitBlock = unitFloor?.block as Record<string, unknown> | undefined

    res.json({
      success: true,
      data: {
        unit: {
          id: unit.id,
          unitNumber: unit.unit_number,
          unitType: unit.unit_type,
          occupancyStatus: unit.occupancyStatus || 'OCCUPIED',
          floorNumber: unitFloor?.floor_number,
          blockName: unitBlock?.block_name,
        },
        occupants,
        primaryResident,
        primaryPayer: primaryResident ? { partyName: primaryResident.name, role: 'PRIMARY_PAYER' } : null,
        subscriptions,
        invoices,
        unbilledItems,
        receipts,
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch unit billing 360 data')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * GET /api/v1/billing/units/:unitId/services
 * Returns recurring subscriptions (food packages, care packages, rent) and pending consumption charges for date range.
 */
export async function getUnitServices(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const unitId = req.params.unitId as string
    const startDate = (req.query.startDate as string) || new Date().toISOString().slice(0, 7) + '-01'
    const endDate = (req.query.endDate as string) || new Date().toISOString().slice(0, 10)

    if (!unitId) {
      res.status(400).json({ success: false, message: 'unitId is required' })
      return
    }

    const unit = await PropertyUnit.findByPk(unitId, {
      include: [
        {
          model: Resident,
          as: 'residents',
          where: { isDeleted: false },
          required: false,
          include: [
            {
              model: ResidentFamilyMember,
              as: 'familyMembers',
              required: false,
              attributes: ['id', 'firstName', 'lastName', 'relation', 'isResiding'],
            },
          ],
        },
      ],
    })

    if (!unit) {
      res.status(404).json({ success: false, message: 'Unit not found' })
      return
    }

    const uJson = unit.toJSON() as unknown as Record<string, unknown>
    const residents = (uJson.residents as Array<Record<string, unknown>>) || []
    const allResidingResidents = residents.filter((r) => r.isResiding !== false)
    const residentIds: string[] = allResidingResidents.map((r) => r.id as string)
    const familyMemberIds: string[] = []
    for (const r of allResidingResidents) {
      const familyMembers = (r.familyMembers as Array<Record<string, unknown>>) || []
      for (const fm of familyMembers) {
        if (fm.isResiding !== false) {
          familyMemberIds.push(fm.id as string)
        }
      }
    }

    // Date boundaries for billing cycle
    const cycleStart = new Date(startDate)
    const cycleEnd = new Date(endDate)
    cycleEnd.setHours(23, 59, 59, 999)

    const year = cycleStart.getFullYear()
    const month = cycleStart.getMonth() // 0-indexed
    const daysInBillingMonth = new Date(year, month + 1, 0).getDate()

    // Prior month boundary for arrear consumption charges (e.g. July for August billing)
    const prevMonthEnd = new Date(cycleStart)
    prevMonthEnd.setMilliseconds(-1) // 1 ms before 1st of current billing month
    const prevMonthEndStr = prevMonthEnd.toISOString().slice(0, 10)

    // 1. Fetch Food Packages
    const fnbSubscriptions = await FnbResidentPackage.findAll({
      where: {
        [Op.or]: [
          ...(residentIds.length > 0 ? [{ residentId: residentIds }] : []),
          ...(familyMemberIds.length > 0 ? [{ familyMemberId: familyMemberIds }] : []),
        ],
        status: 'active',
      },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
        { model: Resident, as: 'resident' },
        { model: ResidentFamilyMember, as: 'familyMember' },
      ],
    })

    const recurringSubscriptions: Array<Record<string, unknown>> = []

    for (const fnb of fnbSubscriptions) {
      const fJson = fnb.toJSON() as unknown as Record<string, unknown>
      const propPkg = fJson.propertyPackage as Record<string, unknown> | undefined
      const globalPkg = propPkg?.globalPackage as Record<string, unknown> | undefined
      const resObj = fJson.resident as Record<string, unknown> | undefined
      const fmObj = fJson.familyMember as Record<string, unknown> | undefined

      const subStartStr = fJson.startDate ? String(fJson.startDate).slice(0, 10) : startDate
      const subStart = new Date(subStartStr)
      const subEnd = fJson.endDate ? new Date(fJson.endDate as string) : null

      // Filter: Exclude if subscription starts AFTER billing cycle end date or ended BEFORE billing cycle start date
      if (subStart > cycleEnd) continue
      if (subEnd && subEnd < cycleStart) continue

      const pkgName = (globalPkg?.name as string) || 'Food Package'
      const monthlyRate = Number(fJson.totalPrice || propPkg?.price || 0)
      const subscriberName = resObj
        ? `${resObj.firstName || ''} ${resObj.lastName || ''} (Primary Resident)`.trim()
        : fmObj
          ? `${fmObj.firstName || ''} ${fmObj.lastName || ''} (${fmObj.relation || 'Family Member'})`.trim()
          : 'Occupant'

      // Calculate proration
      let activeDays = daysInBillingMonth
      let calculatedAmount = monthlyRate
      let isProrated = false

      if (subStart > cycleStart) {
        const startDay = subStart.getDate()
        activeDays = Math.max(1, Math.min(daysInBillingMonth, daysInBillingMonth - startDay + 1))
        if (activeDays < daysInBillingMonth) {
          calculatedAmount = Math.round((monthlyRate / daysInBillingMonth) * activeDays * 100) / 100
          isProrated = true
        }
      }

      recurringSubscriptions.push({
        id: fJson.id,
        serviceType: 'food_package',
        packageName: pkgName,
        subscriberName,
        description: `${subscriberName} - ${pkgName}`,
        monthlyRate,
        unitPrice: monthlyRate,
        amount: calculatedAmount,
        activeDays,
        isProrated,
        daysInMonth: daysInBillingMonth,
        startDate: subStartStr,
        endDate: fJson.endDate || null,
        product: {
          productName: `${subscriberName} - ${pkgName}`,
          productType: 'food_package',
        },
      })
    }

    // 2. Fetch Care Package Subscriptions
    if (residentIds.length > 0) {
      const careSubscriptions = await PackageSubscription.findAll({
        where: {
          residentId: residentIds,
          isDeleted: false,
          [Op.or]: [{ isActive: true }, { status: 'ACTIVE' }],
        },
        include: [
          { model: Package, as: 'carePackage' },
          { model: Resident, as: 'resident' },
        ],
      })

      for (const cs of careSubscriptions) {
        const cJson = cs.toJSON() as unknown as Record<string, unknown>
        const carePkg = cJson.carePackage as Record<string, unknown> | undefined
        const resObj = cJson.resident as Record<string, unknown> | undefined
        const subStartStr = cJson.startDate ? String(cJson.startDate).slice(0, 10) : startDate
        const subStart = new Date(subStartStr)
        const subEnd = cJson.endDate ? new Date(cJson.endDate as string) : null

        if (subStart > cycleEnd) continue
        if (subEnd && subEnd < cycleStart) continue

        const pkgName = (carePkg?.packageName as string) || 'Care Package'
        const monthlyRate = Number(carePkg?.packageCost || cJson.totalCost || 0)
        const subscriberName = resObj
          ? `${resObj.firstName || ''} ${resObj.lastName || ''} (Primary Resident)`.trim()
          : 'Resident'

        let activeDays = daysInBillingMonth
        let calculatedAmount = monthlyRate
        let isProrated = false

        if (subStart > cycleStart) {
          const startDay = subStart.getDate()
          activeDays = Math.max(1, Math.min(daysInBillingMonth, daysInBillingMonth - startDay + 1))
          if (activeDays < daysInBillingMonth) {
            calculatedAmount = Math.round((monthlyRate / daysInBillingMonth) * activeDays * 100) / 100
            isProrated = true
          }
        }

        recurringSubscriptions.push({
          id: cJson.id,
          serviceType: 'care_package',
          packageName: pkgName,
          subscriberName,
          description: `${subscriberName} - ${pkgName}`,
          monthlyRate,
          unitPrice: monthlyRate,
          amount: calculatedAmount,
          activeDays,
          isProrated,
          daysInMonth: daysInBillingMonth,
          startDate: subStartStr,
          endDate: cJson.endDate || null,
          product: {
            productName: `${subscriberName} - ${pkgName}`,
            productType: 'care_package',
          },
        })
      }
    }

    // 3. Fetch Pending Consumption Charges (Billed in Arrears for Prior Month <= prevMonthEndStr)
    const pendingConsumptionCharges: Array<Record<string, unknown>> = []

    // Care Task Charges
    if (residentIds.length > 0) {
      const careTaskCharges = await AdditionalTaskCharge.findAll({
        where: {
          residentId: residentIds,
          isDeleted: false,
          isActive: true,
          completedAt: { [Op.lte]: prevMonthEnd },
        },
      })

      for (const ct of careTaskCharges) {
        const ctJson = ct.toJSON() as unknown as Record<string, unknown>
        pendingConsumptionCharges.push({
          id: ctJson.id,
          sourceModule: 'CARE_TASK',
          serviceType: 'care_task',
          itemName: ctJson.taskName || 'Care Task Charge',
          description: ctJson.description || 'Care Task completion session',
          quantity: 1,
          unitPrice: Number(ctJson.unitPrice || ctJson.price || 0),
          amount: Number(ctJson.price || 0),
          date: ctJson.completedAt ? String(ctJson.completedAt).slice(0, 10) : prevMonthEndStr,
        })
      }
    }

    // Inventory Item Disburse Charges
    const inventoryItems = await UnitMiscellaneousItem.findAll({
      where: {
        [Op.or]: [{ unitId: unit.id }, ...(residentIds.length > 0 ? [{ residentId: residentIds }] : [])],
        isBilled: false,
        date: { [Op.lte]: prevMonthEndStr },
      },
    })

    for (const inv of inventoryItems) {
      const iJson = inv.toJSON() as unknown as Record<string, unknown>
      pendingConsumptionCharges.push({
        id: iJson.id,
        sourceModule: 'INVENTORY',
        serviceType: 'inventory_item',
        itemName: iJson.itemName,
        description: iJson.notes || 'Inventory disburse item',
        quantity: Number(iJson.totalQuantity || 1),
        unitPrice: Number(iJson.unitPrice || 0),
        amount: Number(iJson.price || 0),
        date: iJson.date,
      })
    }

    // Food Orders (unbilled from prior month)
    if (residentIds.length > 0) {
      const foodOrders = await FnbResidentOrder.findAll({
        where: {
          residentId: residentIds,
          isPackageCovered: false,
          orderStatus: { [Op.ne]: 'cancelled' },
          date: { [Op.lte]: prevMonthEndStr },
        },
      })

      for (const order of foodOrders) {
        const oJson = order.toJSON() as unknown as Record<string, unknown>
        const orderIdStr = (oJson.id as string) || ''
        pendingConsumptionCharges.push({
          id: oJson.id,
          sourceModule: 'FOOD_ORDERS',
          serviceType: 'food_orders',
          itemName: `Food Order #${(oJson.orderNumber as string) || orderIdStr.slice(0, 6)}`,
          description: `On-demand food order (${oJson.diningType || 'delivery'})`,
          quantity: 1,
          unitPrice: Number(oJson.totalAmount || oJson.netAmount || 0),
          amount: Number(oJson.totalAmount || oJson.netAmount || 0),
          date: oJson.date ? String(oJson.date).slice(0, 10) : prevMonthEndStr,
        })
      }
    }

    const recurringSubscriptionsTotal = recurringSubscriptions.reduce((acc, item) => acc + Number(item.amount || 0), 0)
    const pendingConsumptionTotal = pendingConsumptionCharges.reduce((acc, item) => acc + Number(item.amount || 0), 0)

    res.json({
      success: true,
      data: {
        unitId: unit.id,
        startDate,
        endDate,
        recurringSubscriptions,
        pendingConsumptionCharges,
        summary: {
          recurringSubscriptionsTotal,
          pendingConsumptionTotal,
          estimatedSubtotal: recurringSubscriptionsTotal + pendingConsumptionTotal,
        },
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch unit services')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * POST /api/v1/billing/invoices/generate
 * Generates a MONTHLY invoice containing food_package, food_orders, monthly_rents, and miscellaneous items.
 */
export async function generateInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      unitId,
      residentId,
      startDate,
      endDate,
      dueDate,
      services = [],
      miscellaneousItems = [],
      discountValue = 0,
      notes,
    } = req.body

    if (!unitId && !residentId) {
      res.status(400).json({ success: false, message: 'unitId or residentId is required' })
      return
    }

    const targetUnitId = unitId
    let targetResidentId = residentId
    let loc_id = req.user?.defaultLocationId || req.body.loc_id

    if (unitId && !targetResidentId) {
      const resident = await Resident.findOne({ where: { unitId, isResiding: true } })
      targetResidentId = resident?.id || null
      if (resident?.locId) loc_id = resident.locId
    }

    if (!loc_id) {
      const unitObj = await PropertyUnit.findByPk(unitId, {
        include: [{ model: PropertyFloor, as: 'floor', include: [{ model: PropertyBlock, as: 'block' }] }],
      })
      const unitObjJson = unitObj?.toJSON() as unknown as Record<string, unknown> | undefined
      const floorObj = unitObjJson?.floor as Record<string, unknown> | undefined
      const blockObj = floorObj?.block as Record<string, unknown> | undefined
      loc_id = (blockObj?.propertyId as string) || '00000000-0000-0000-0000-000000000000'
    }

    const invoiceNumber = await generateInvoiceNumber()

    // Calculate subtotal from services and miscellaneous items
    const servicesSubtotal = services.reduce(
      (acc: number, item: Record<string, unknown>) => acc + Number(item.price || 0) * Number(item.quantity || 1),
      0,
    )
    const miscSubtotal = miscellaneousItems.reduce(
      (acc: number, item: Record<string, unknown>) => acc + Number(item.price || 0) * Number(item.quantity || 1),
      0,
    )
    const subtotal = servicesSubtotal + miscSubtotal
    const discount = Number(discountValue || 0)
    const total = Math.max(0, subtotal - discount)

    const invoice = await Invoice.create({
      invoiceNumber,
      residentId: targetResidentId,
      unitId: targetUnitId,
      loc_id,
      startDate: startDate || new Date().toISOString().split('T')[0],
      endDate: endDate || new Date().toISOString().split('T')[0],
      dueDate: dueDate || null,
      subtotal,
      tax: 0,
      discount,
      total,
      discountedAmount: total,
      currency: 'INR',
      status: InvoiceStatus.PENDING,
      billingMode: 'MONTHLY',
      paidAmount: 0,
      notes: notes || null,
      isFinalBill: false,
      depositDeduction: 0,
      advanceDeduction: 0,
      refundAmount: 0,
      netRefundDue: 0,
      banking_on: 'company',
    })

    // Create itemized services_invoice items
    if (services.length > 0) {
      await ServicesInvoice.bulkCreate(
        services.map((s: Record<string, unknown>) => ({
          invoiceId: invoice.id,
          serviceType: (s.serviceType as ServiceType) || ServiceType.MONTHLY_RENTS,
          name: s.name || 'Monthly Service',
          description: s.description || null,
          quantity: Number(s.quantity || 1),
          price: Number(s.price || 0),
          total: Number(s.price || 0) * Number(s.quantity || 1),
        })),
      )
    }

    // Create itemized miscellaneous_billing items
    if (miscellaneousItems.length > 0) {
      await MiscellaneousBilling.bulkCreate(
        miscellaneousItems.map((m: Record<string, unknown>) => ({
          invoiceId: invoice.id,
          unitId: targetUnitId,
          name: m.name || m.description || 'Ad-hoc Item',
          description: m.description || null,
          quantity: Number(m.quantity || 1),
          price: Number(m.price || 0),
          total: Number(m.price || 0) * Number(m.quantity || 1),
        })),
      )
    }

    const createdWithItems = await Invoice.findByPk(invoice.id, {
      include: [
        { model: ServicesInvoice, as: 'services' },
        { model: MiscellaneousBilling, as: 'miscellaneousItems' },
      ],
    })

    res.status(201).json({ success: true, data: createdWithItems })
  } catch (error) {
    logger.error({ error }, 'Failed to generate invoice')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * POST /api/v1/billing/payments
 * Records payment for an invoice and issues a receipt.
 */
export async function createPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { invoiceId, paidAmount, paymentMethod, paymentReference, notes, imageUrl } = req.body

    if (!invoiceId || !paidAmount) {
      res.status(400).json({ success: false, message: 'invoiceId and paidAmount are required' })
      return
    }

    const invoice = await Invoice.findByPk(invoiceId)
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' })
      return
    }

    const amountNum = Number(paidAmount)
    const newPaidAmount = Number(invoice.paidAmount || 0) + amountNum
    const remainingBalance = Math.max(0, Number(invoice.total || 0) - newPaidAmount)
    const newStatus = remainingBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID

    const receiptNumber = await generateReceiptNumber()

    const receipt = await Receipt.create({
      receiptNumber,
      invoiceId: invoice.id,
      residentId: invoice.residentId,
      unitId: invoice.unitId,
      paidAmount: amountNum,
      paymentMethod: paymentMethod || PaymentMethod.CASH,
      paymentReference: paymentReference || null,
      notes: notes || null,
      handed_over_to: req.user?.id || null,
      invoiceRemainingBalance: remainingBalance,
      invoiceStatus: newStatus,
      imageUrl: imageUrl || null,
    })

    await invoice.update({
      paidAmount: newPaidAmount,
      status: newStatus,
      paymentMethod: paymentMethod || invoice.paymentMethod,
      paymentReference: paymentReference || invoice.paymentReference,
    })

    res.status(201).json({ success: true, data: { receipt, invoice } })
  } catch (error) {
    logger.error({ error }, 'Failed to record payment')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * GET /api/v1/billing/invoices
 */
export async function getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { unitId, residentId, status, propertyId, locationId, loc_id } = req.query
    const targetLocId = (propertyId || locationId || loc_id || req.params.locationId) as string | undefined
    const where: Record<string, unknown> = {}
    if (targetLocId && targetLocId !== 'ALL' && targetLocId !== 'all') {
      where.loc_id = String(targetLocId)
    }
    if (unitId) where.unitId = String(unitId)
    if (residentId) where.residentId = String(residentId)
    if (status) where.status = String(status)

    const invoices = await Invoice.findAll({
      where,
      include: [
        { model: ServicesInvoice, as: 'services' },
        { model: MiscellaneousBilling, as: 'miscellaneousItems' },
        { model: Receipt, as: 'receipts' },
      ],
      order: [['createdAt', 'DESC']],
    })

    res.json({ success: true, data: invoices })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch invoices')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * GET /api/v1/billing/invoices/:id
 */
export async function getInvoiceById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const invoiceId = req.params.id as string
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [
        { model: ServicesInvoice, as: 'services' },
        { model: MiscellaneousBilling, as: 'miscellaneousItems' },
        { model: Receipt, as: 'receipts' },
      ],
    })

    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' })
      return
    }

    res.json({ success: true, data: invoice })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch invoice by ID')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * GET /api/v1/billing/miscellaneous-services
 */
export async function getMiscellaneousServices(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { residentId, unitId, isBilled } = req.query
    const where: Record<string, unknown> = {}
    if (residentId) where.residentId = String(residentId)
    if (unitId) where.unitId = String(unitId)
    if (isBilled !== undefined) where.isBilled = isBilled === 'true'

    const items = await UnitMiscellaneousItem.findAll({
      where,
      order: [['date', 'DESC']],
    })

    res.json({ success: true, data: items })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch miscellaneous services')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * POST /api/v1/billing/miscellaneous-services
 */
export async function createMiscellaneousService(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { residentId, unitId, itemName, totalQuantity, unitPrice, unit, date, time, notes, employeeId } = req.body

    if (!residentId || !itemName || !unitPrice) {
      res.status(400).json({ success: false, message: 'residentId, itemName, and unitPrice are required' })
      return
    }

    const qty = Number(totalQuantity || 1)
    const price = Number(unitPrice) * qty

    const item = await UnitMiscellaneousItem.create({
      residentId,
      unitId: unitId || null,
      employeeId: employeeId || req.user?.id || null,
      itemName,
      totalQuantity: qty,
      quantityTaken: qty,
      unitPrice: Number(unitPrice),
      price,
      unit: unit || 'item',
      date: date || new Date().toISOString().split('T')[0],
      time: time || new Date().toTimeString().slice(0, 5),
      notes: notes || null,
      loc_id: req.user?.defaultLocationId || '00000000-0000-0000-0000-000000000000',
      isBilled: false,
    })

    res.status(201).json({ success: true, data: item })
  } catch (error) {
    logger.error({ error }, 'Failed to create miscellaneous service')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * GET /api/v1/billing/settings/tax
 */
export async function getTaxSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    let settings = await GstTaxSettings.findOne()
    if (!settings) {
      settings = await GstTaxSettings.create({
        gstEnabled: true,
        defaultGstRate: 18.0,
        cgstRate: 9.0,
        sgstRate: 9.0,
        companyGstNumber: '',
      })
    }
    res.json({
      success: true,
      data: {
        gstEnabled: settings.gstEnabled,
        defaultGstRate: Number(settings.defaultGstRate || 18),
        cgstRate: Number(settings.cgstRate || 9),
        sgstRate: Number(settings.sgstRate || 9),
        companyGstNumber: settings.companyGstNumber || '',
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch tax settings')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * PUT /api/v1/billing/settings/tax
 */
export async function updateTaxSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { gstEnabled, defaultGstRate, cgstRate, sgstRate, companyGstNumber } = req.body

    let settings = await GstTaxSettings.findOne()
    if (!settings) {
      settings = await GstTaxSettings.create({
        gstEnabled: Boolean(gstEnabled),
        defaultGstRate: Number(defaultGstRate ?? 18),
        cgstRate: Number(cgstRate ?? 9),
        sgstRate: Number(sgstRate ?? 9),
        companyGstNumber: companyGstNumber || null,
      })
    } else {
      await settings.update({
        gstEnabled: Boolean(gstEnabled),
        defaultGstRate: Number(defaultGstRate ?? 18),
        cgstRate: Number(cgstRate ?? 9),
        sgstRate: Number(sgstRate ?? 9),
        companyGstNumber: companyGstNumber || null,
      })
    }

    res.json({
      success: true,
      data: {
        gstEnabled: settings.gstEnabled,
        defaultGstRate: Number(settings.defaultGstRate),
        cgstRate: Number(settings.cgstRate),
        sgstRate: Number(settings.sgstRate),
        companyGstNumber: settings.companyGstNumber || '',
      },
      message: 'GST & Tax Settings updated successfully',
    })
  } catch (error) {
    logger.error({ error }, 'Failed to update tax settings')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
