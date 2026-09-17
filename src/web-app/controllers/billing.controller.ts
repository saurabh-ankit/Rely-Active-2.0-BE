/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { Op } from 'sequelize'
import {
  AdditionalTaskCharge,
  BillingAccount,
  BillingEvent,
  BillingParty,
  BillingPricePlan,
  BillingProduct,
  BillingRun,
  BillingSubscription,
  CareTask,
  Company,
  CompanyCustomField,
  FnbGlobalPackage,
  FnbPropertyPackage,
  FnbResidentPackage,
  InventoryStockTransaction,
  InventoryStockTransactionLine,
  Invoice,
  InvoiceLine,
  Package,
  PackageSubscription,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  UnitResident,
} from '../../models/index.js'
import {
  BillingEventSourceModule,
  BillingEventStatus,
  BillingPartyRole,
  BillingPartyType,
  BillingProductCategory,
  BillingRunType,
  ChargeType,
  SubscriptionStatus,
} from '../../enums/billing.enum.js'
import {
  cancelBillingEventSchema,
  createBillingAccountSchema,
  createBillingPartySchema,
  createSubscriptionSchema,
  generateInvoiceSchema,
  ingestBillingEventSchema,
  updateBillingEventSchema,
  pauseSubscriptionSchema,
  taxSettingsSchema,
  triggerBillingRunSchema,
  updateBillingAccountSchema,
  updateBillingPartySchema,
} from '../../validations/billing.validation.js'
import { generateInvoiceForAccount, resolveBillingAccount } from '../../services/billing/invoiceGenerator.service.js'
import { getAccountLedgerStatement } from '../../services/billing/ledger.service.js'
import { getBillingQueue, processBatchBilling } from '../../queues/billing.queue.js'
import { logger } from '../../config/logger.js'
import { uploadFileToS3 } from '../../middlewares/s3/index.js'

// ── 1. BILLING ACCOUNTS ──────────────────────────────────────────────────────

export async function createBillingAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = createBillingAccountSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const data = parseResult.data

    // Generate unique account number: BA-{unitId.slice(0,4)}-{rand}
    const suffix = Math.floor(1000 + Math.random() * 9000)
    const unit = await PropertyUnit.findByPk(data.unitId)
    const unitLabel = unit?.unit_number?.replace(/[^a-zA-Z0-9]/g, '') || 'UNIT'
    const accountNumber = `BA-${unitLabel}-${suffix}`

    const account = await BillingAccount.create({
      unitId: data.unitId,
      propertyId: data.propertyId,
      companyId: data.companyId,
      primaryResidentId: data.primaryResidentId || null,
      accountName: data.accountName,
      billingMode: data.billingMode,
      billingCycle: data.billingCycle,
      billingDay: data.billingDay,
      currency: data.currency,
      notes: data.notes || null,
      accountNumber,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    })

    // If primaryResidentId was provided, auto-create initial primary payer party
    if (data.primaryResidentId) {
      const resident = await Resident.findByPk(data.primaryResidentId)
      if (resident) {
        await BillingParty.create({
          billingAccountId: account.id,
          partyType: BillingPartyType.RESIDENT,
          residentId: resident.id,
          familyMemberId: null,
          partyName: `${resident.firstName} ${resident.lastName || ''}`.trim(),
          partyEmail: resident.email || null,
          partyPhone: resident.phone || null,
          partyAddress: null,
          partyGstin: null,
          role: BillingPartyRole.PRIMARY_PAYER,
          isDefault: true,
          createdBy: req.user?.id || null,
          updatedBy: req.user?.id || null,
        })
      }
    }

    const createdWithParties = await BillingAccount.findByPk(account.id, {
      include: [
        { model: BillingParty, as: 'parties' },
        { model: PropertyUnit, as: 'unit' },
        { model: Resident, as: 'primaryResident' },
      ],
    })

    res.status(201).json({ success: true, data: createdWithParties })
  } catch (error) {
    logger.error({ error }, 'Failed to create billing account')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getBillingAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { propertyId, unitId, status, search, page = '1', limit = '20' } = req.query
    const targetPropertyId = (req.params.locationId || propertyId || req.query.locationId) as string | undefined

    const where: Record<string | symbol, unknown> = { isDeleted: false }
    if (targetPropertyId && targetPropertyId !== 'ALL' && targetPropertyId !== 'all') {
      where.propertyId = String(targetPropertyId)
    }
    if (unitId) where.unitId = String(unitId)
    if (status) where.status = String(status)

    if (search) {
      where[Op.or] = [
        { accountName: { [Op.like]: `%${String(search)}%` } },
        { accountNumber: { [Op.like]: `%${String(search)}%` } },
      ]
    }

    const offset = (Number(page) - 1) * Number(limit)
    const { rows: accounts, count } = await BillingAccount.findAndCountAll({
      where,
      limit: Number(limit),
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        { model: PropertyUnit, as: 'unit' },
        { model: Resident, as: 'primaryResident' },
        { model: BillingParty, as: 'parties', where: { isActive: true }, required: false },
      ],
    })

    res.json({
      success: true,
      data: accounts,
      meta: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to list billing accounts')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getBillingAccountById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '')
    if (!id) {
      res.status(400).json({ success: false, message: 'Account ID is required' })
      return
    }

    const account = await BillingAccount.findByPk(id, {
      include: [
        { model: PropertyUnit, as: 'unit' },
        { model: Property, as: 'property' },
        { model: Resident, as: 'primaryResident' },
        { model: BillingParty, as: 'parties' },
        {
          model: BillingSubscription,
          as: 'subscriptions',
          where: { isActive: true },
          required: false,
          include: [{ model: BillingProduct, as: 'product' }],
        },
      ],
    })

    if (!account || account.isDeleted) {
      res.status(404).json({ success: false, message: 'Billing account not found' })
      return
    }

    // Fetch active unit occupants from billing_unit_residents
    const occupants = await UnitResident.findAll({
      where: { unitId: account.unitId, isActive: true },
      include: [{ model: Resident, as: 'resident' }],
    })

    res.json({
      success: true,
      data: {
        ...account.toJSON(),
        currentOccupants: occupants,
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get billing account by id')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function updateBillingAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '')
    const parseResult = updateBillingAccountSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const account = await BillingAccount.findByPk(id)
    if (!account || account.isDeleted) {
      res.status(404).json({ success: false, message: 'Billing account not found' })
      return
    }

    const updatePayload: Record<string, unknown> = {
      updatedBy: req.user?.id || null,
    }
    if (parseResult.data.accountName !== undefined) updatePayload.accountName = parseResult.data.accountName
    if (parseResult.data.status !== undefined) updatePayload.status = parseResult.data.status
    if (parseResult.data.billingCycle !== undefined) updatePayload.billingCycle = parseResult.data.billingCycle
    if (parseResult.data.billingDay !== undefined) updatePayload.billingDay = parseResult.data.billingDay
    if (parseResult.data.notes !== undefined) updatePayload.notes = parseResult.data.notes

    await account.update(updatePayload)

    res.json({ success: true, data: account })
  } catch (error) {
    logger.error({ error }, 'Failed to update billing account')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── 2. BILLING PARTIES ───────────────────────────────────────────────────────

export async function addBillingParty(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = createBillingPartySchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const data = parseResult.data

    // If new party is PRIMARY_PAYER or isDefault, unset previous default/primary
    if (data.role === BillingPartyRole.PRIMARY_PAYER || data.isDefault) {
      await BillingParty.update(
        { role: BillingPartyRole.SECONDARY_PAYER, isDefault: false },
        { where: { billingAccountId: data.billingAccountId, role: BillingPartyRole.PRIMARY_PAYER } },
      )
    }

    const party = await BillingParty.create({
      billingAccountId: data.billingAccountId,
      partyType: data.partyType,
      residentId: data.residentId || null,
      familyMemberId: data.familyMemberId || null,
      partyName: data.partyName,
      partyEmail: data.partyEmail || null,
      partyPhone: data.partyPhone || null,
      partyAddress: data.partyAddress || null,
      partyGstin: data.partyGstin || null,
      role: data.role,
      isDefault: data.isDefault,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    })

    res.status(201).json({ success: true, data: party })
  } catch (error) {
    logger.error({ error }, 'Failed to add billing party')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function updateBillingParty(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const partyId = String(req.params.partyId || '')
    const parseResult = updateBillingPartySchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const party = await BillingParty.findByPk(partyId)
    if (!party) {
      res.status(404).json({ success: false, message: 'Billing party not found' })
      return
    }

    if (parseResult.data.role === BillingPartyRole.PRIMARY_PAYER) {
      await BillingParty.update(
        { role: BillingPartyRole.SECONDARY_PAYER, isDefault: false },
        { where: { billingAccountId: party.billingAccountId, role: BillingPartyRole.PRIMARY_PAYER } },
      )
    }

    const partyUpdatePayload: Record<string, unknown> = {
      updatedBy: req.user?.id || null,
    }
    if (parseResult.data.partyName !== undefined) partyUpdatePayload.partyName = parseResult.data.partyName
    if (parseResult.data.partyEmail !== undefined) partyUpdatePayload.partyEmail = parseResult.data.partyEmail
    if (parseResult.data.partyPhone !== undefined) partyUpdatePayload.partyPhone = parseResult.data.partyPhone
    if (parseResult.data.partyAddress !== undefined) partyUpdatePayload.partyAddress = parseResult.data.partyAddress
    if (parseResult.data.partyGstin !== undefined) partyUpdatePayload.partyGstin = parseResult.data.partyGstin
    if (parseResult.data.role !== undefined) partyUpdatePayload.role = parseResult.data.role
    if (parseResult.data.isDefault !== undefined) partyUpdatePayload.isDefault = parseResult.data.isDefault
    if (parseResult.data.isActive !== undefined) partyUpdatePayload.isActive = parseResult.data.isActive

    await party.update(partyUpdatePayload)

    res.json({ success: true, data: party })
  } catch (error) {
    logger.error({ error }, 'Failed to update billing party')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── 3. BILLING SUBSCRIPTIONS ────────────────────────────────────────────────

export async function createSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = createSubscriptionSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const data = parseResult.data

    const subscription = await BillingSubscription.create({
      billingAccountId: data.billingAccountId,
      contractId: data.contractId || null,
      unitId: data.unitId,
      productId: data.productId,
      pricePlanId: data.pricePlanId || null,
      description: data.description || null,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      billingFrequency: data.billingFrequency,
      prorationPolicy: data.prorationPolicy,
      startDate: data.startDate,
      endDate: data.endDate || null,
      fnbPackageId: data.fnbPackageId || null,
      status: SubscriptionStatus.ACTIVE,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    })

    const full = await BillingSubscription.findByPk(subscription.id, {
      include: [{ model: BillingProduct, as: 'product' }],
    })

    res.status(201).json({ success: true, data: full })
  } catch (error) {
    logger.error({ error }, 'Failed to create billing subscription')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getSubscriptions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const accountId = String(req.params.accountId || '')
    const subscriptions = await BillingSubscription.findAll({
      where: { billingAccountId: accountId, isActive: true },
      include: [
        { model: BillingProduct, as: 'product' },
        { model: BillingPricePlan, as: 'pricePlan' },
      ],
      order: [['startDate', 'DESC']],
    })

    res.json({ success: true, data: subscriptions })
  } catch (error) {
    logger.error({ error }, 'Failed to get subscriptions')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function pauseSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '')
    const parseResult = pauseSubscriptionSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const sub = await BillingSubscription.findByPk(id)
    if (!sub || !sub.isActive) {
      res.status(404).json({ success: false, message: 'Subscription not found' })
      return
    }

    await sub.update({
      status: SubscriptionStatus.PAUSED,
      pauseStart: parseResult.data.pauseStart,
      pauseEnd: parseResult.data.pauseEnd || null,
      updatedBy: req.user?.id || null,
    })

    res.json({ success: true, data: sub })
  } catch (error) {
    logger.error({ error }, 'Failed to pause subscription')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function resumeSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '')
    const sub = await BillingSubscription.findByPk(id)
    if (!sub || !sub.isActive) {
      res.status(404).json({ success: false, message: 'Subscription not found' })
      return
    }

    await sub.update({
      status: SubscriptionStatus.ACTIVE,
      pauseStart: null,
      pauseEnd: null,
      updatedBy: req.user?.id || null,
    })

    res.json({ success: true, data: sub })
  } catch (error) {
    logger.error({ error }, 'Failed to resume subscription')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function cancelSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '')
    const sub = await BillingSubscription.findByPk(id)
    if (!sub || !sub.isActive) {
      res.status(404).json({ success: false, message: 'Subscription not found' })
      return
    }

    const todayStr = new Date().toISOString().split('T')[0] || ''
    await sub.update({
      status: SubscriptionStatus.CANCELLED,
      endDate: todayStr,
      updatedBy: req.user?.id || null,
    })

    res.json({ success: true, data: sub })
  } catch (error) {
    logger.error({ error }, 'Failed to cancel subscription')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── 4. USAGE EVENTS INGESTION ────────────────────────────────────────────────

export async function ingestEvent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = ingestBillingEventSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const data = parseResult.data

    // If billingAccountId not provided, resolve account from unitId and residentId
    let accountId = data.billingAccountId
    let account: BillingAccount | null = null
    if (accountId) {
      account = await BillingAccount.findByPk(accountId)
    } else {
      account = await resolveBillingAccount(data.unitId, data.residentId ?? undefined)
      if (account) {
        accountId = account.id
      }
    }

    // Auto-ensure folio if missing for this unit
    if (!accountId || !account) {
      if (data.unitId) {
        const unit = await PropertyUnit.findByPk(data.unitId, {
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
            },
            {
              model: UnitResident,
              as: 'unitResidents',
              where: { isActive: true },
              required: false,
              include: [{ model: Resident, as: 'resident' }],
            },
          ],
        })

        if (unit) {
          let primaryResident: any = null
          if (data.residentId) {
            primaryResident = await Resident.findByPk(data.residentId)
          }
          if (!primaryResident) {
            const billingResidents = ((unit as any).unitResidents || []).map((ur: any) => ur.resident).filter(Boolean)
            const coreResidents = (unit as any).residents || []
            primaryResident =
              billingResidents.find((r: any) => r.isResiding) ||
              coreResidents.find((r: any) => r.isResiding) ||
              billingResidents[0] ||
              coreResidents[0] ||
              null
          }

          if (primaryResident) {
            account = await syncUnitFolioAndSubscriptions(unit, primaryResident)
            if (account) {
              accountId = account.id
            }
          }
        }
      }
    }

    if (!accountId || !account) {
      res.status(400).json({
        success: false,
        message: `No active billing account found for unit ${data.unitId}. Please create a folio first.`,
      })
      return
    }

    const propertyId = data.propertyId || account.propertyId
    const residentId = data.residentId || account.primaryResidentId
    if (!residentId) {
      res.status(400).json({
        success: false,
        message: 'A resident must be assigned to this charge or billing account.',
      })
      return
    }

    const amount = data.amount !== undefined ? data.amount : Number((data.quantity * data.unitPrice).toFixed(2))

    const event = await BillingEvent.create({
      billingAccountId: accountId,
      unitId: data.unitId,
      residentId,
      propertyId,
      sourceModule: data.sourceModule,
      sourceType: data.sourceType,
      sourceId: data.sourceId || null,
      productId: data.productId || null,
      chargeType: data.chargeType,
      description: data.description,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      amount,
      serviceDate: data.serviceDate,
      status: BillingEventStatus.PENDING,
    })

    res.status(201).json({ success: true, data: event })
  } catch (error) {
    logger.error({ error }, 'Failed to ingest billing event')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function updateEvent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = updateBillingEventSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const event = await BillingEvent.findByPk(String(req.params.eventId || ''))
    if (!event) {
      res.status(404).json({ success: false, message: 'Billing event not found' })
      return
    }
    if (event.status !== BillingEventStatus.PENDING || event.sourceModule !== BillingEventSourceModule.MANUAL) {
      res.status(409).json({ success: false, message: 'Only pending manual charges can be edited' })
      return
    }

    const data = parseResult.data
    const quantity = data.quantity ?? Number(event.quantity)
    const unitPrice = data.unitPrice ?? Number(event.unitPrice)
    const updates: Record<string, unknown> = { amount: data.amount ?? Number((quantity * unitPrice).toFixed(2)) }
    if (data.residentId !== undefined) updates.residentId = data.residentId
    if (data.sourceModule !== undefined) updates.sourceModule = data.sourceModule
    if (data.sourceType !== undefined) updates.sourceType = data.sourceType
    if (data.chargeType !== undefined) updates.chargeType = data.chargeType
    if (data.description !== undefined) updates.description = data.description
    if (data.quantity !== undefined) updates.quantity = data.quantity
    if (data.unitPrice !== undefined) updates.unitPrice = data.unitPrice
    if (data.serviceDate !== undefined) updates.serviceDate = data.serviceDate
    await event.update(updates)
    res.json({ success: true, data: event })
  } catch (error) {
    logger.error({ error }, 'Failed to update billing event')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function uploadEventAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const event = await BillingEvent.findByPk(String(req.params.eventId || ''))
    if (!event) {
      res.status(404).json({ success: false, message: 'Billing event not found' })
      return
    }
    if (event.status !== BillingEventStatus.PENDING || event.sourceModule !== BillingEventSourceModule.MANUAL) {
      res.status(409).json({ success: false, message: 'Bills can only be added to pending manual charges' })
      return
    }
    if (!req.file) {
      res.status(400).json({ success: false, message: 'A bill or receipt file is required' })
      return
    }

    const upload = await uploadFileToS3(req.file, 'billing/event-bills')
    const attachments = Array.isArray(event.attachments) ? event.attachments : []
    attachments.push({
      name: req.file.originalname,
      url: upload.location,
      contentType: upload.contentType,
      size: upload.size,
    })
    await event.update({ attachments })
    res.status(201).json({ success: true, data: event })
  } catch (error) {
    logger.error({ error }, 'Failed to upload billing event attachment')
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to upload bill' })
  }
}

export async function getPendingEvents(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const accountId = String(req.params.accountId || '')
    const events = await BillingEvent.findAll({
      where: { billingAccountId: accountId, status: BillingEventStatus.PENDING },
      order: [['serviceDate', 'ASC']],
      include: [
        { model: Resident, as: 'resident' },
        { model: BillingProduct, as: 'product' },
      ],
    })

    res.json({ success: true, data: events })
  } catch (error) {
    logger.error({ error }, 'Failed to get pending events')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function cancelEvent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const eventId = String(req.params.eventId || '')
    const parseResult = cancelBillingEventSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const event = await BillingEvent.findByPk(eventId)
    if (!event) {
      res.status(404).json({ success: false, message: 'Billing event not found' })
      return
    }

    if (event.status === BillingEventStatus.INVOICED) {
      res.status(400).json({
        success: false,
        message: 'Cannot cancel an event that is already invoiced. Issue a compensating credit note instead.',
      })
      return
    }

    await event.update({
      status: BillingEventStatus.CANCELLED,
      cancellationReason: parseResult.data.cancellationReason,
      cancelledAt: new Date(),
    })

    res.json({ success: true, data: event })
  } catch (error) {
    logger.error({ error }, 'Failed to cancel billing event')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── 5. INVOICE GENERATION & QUERIES ─────────────────────────────────────────

export async function previewInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = generateInvoiceSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const result = await generateInvoiceForAccount({
      billingAccountId: parseResult.data.billingAccountId,
      periodStart: parseResult.data.periodStart,
      periodEnd: parseResult.data.periodEnd,
      issueDate: parseResult.data.issueDate,
      dueDate: parseResult.data.dueDate,
      isPreview: true,
      includePendingEvents: parseResult.data.includePendingEvents,
      pendingEventIds: parseResult.data.pendingEventIds,
      billingMode: parseResult.data.billingMode,
      includeSubscriptions: parseResult.data.includeSubscriptions,
      discountType: parseResult.data.discountType,
      discountValue: parseResult.data.discountValue,
      discountNote: parseResult.data.discountNote ?? undefined,
      performedBy: req.user?.id,
    })

    res.json({ success: true, data: result.preview })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    logger.error({ error }, 'Failed to preview invoice')
    res.status(400).json({ success: false, message: msg })
  }
}

export async function generateInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = generateInvoiceSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const result = await generateInvoiceForAccount({
      billingAccountId: parseResult.data.billingAccountId,
      periodStart: parseResult.data.periodStart,
      periodEnd: parseResult.data.periodEnd,
      issueDate: parseResult.data.issueDate,
      dueDate: parseResult.data.dueDate,
      isPreview: false,
      includePendingEvents: parseResult.data.includePendingEvents,
      pendingEventIds: parseResult.data.pendingEventIds,
      billingMode: parseResult.data.billingMode,
      includeSubscriptions: parseResult.data.includeSubscriptions,
      discountType: parseResult.data.discountType,
      discountValue: parseResult.data.discountValue,
      discountNote: parseResult.data.discountNote ?? undefined,
      performedBy: req.user?.id,
    })

    res.status(201).json({ success: true, data: result.invoice })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    logger.error({ error }, 'Failed to generate invoice')
    res.status(400).json({ success: false, message: msg })
  }
}

export async function getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { propertyId, billingAccountId, status, page = '1', limit = '20' } = req.query
    const targetPropertyId = (req.params.locationId || propertyId || req.query.locationId) as string | undefined

    const where: Record<string, unknown> = { isDeleted: false }
    if (targetPropertyId && targetPropertyId !== 'ALL' && targetPropertyId !== 'all') {
      where.propertyId = String(targetPropertyId)
    }
    if (billingAccountId) where.billingAccountId = String(billingAccountId)
    if (status) where.status = String(status)

    const offset = (Number(page) - 1) * Number(limit)
    const { rows: invoices, count } = await Invoice.findAndCountAll({
      where,
      limit: Number(limit),
      offset,
      order: [['issueDate', 'DESC']],
      include: [
        { model: BillingAccount, as: 'billingAccount' },
        { model: PropertyUnit, as: 'unit' },
      ],
    })

    res.json({
      success: true,
      data: invoices,
      meta: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to list invoices')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getInvoiceById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '')
    const invoice = await Invoice.findByPk(id, {
      include: [
        {
          model: InvoiceLine,
          as: 'lines',
          include: [{ model: Resident, as: 'consumedByResident' }],
        },
        { model: BillingAccount, as: 'billingAccount' },
        { model: PropertyUnit, as: 'unit' },
      ],
    })

    if (!invoice || invoice.isDeleted) {
      res.status(404).json({ success: false, message: 'Invoice not found' })
      return
    }

    res.json({ success: true, data: invoice })
  } catch (error) {
    logger.error({ error }, 'Failed to get invoice by id')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── 6. LEDGER STATEMENTS ────────────────────────────────────────────────────

export async function getLedgerStatement(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const accountId = String(req.params.accountId || '')
    const { startDate, endDate } = req.query

    if (!accountId) {
      res.status(400).json({ success: false, message: 'Account ID is required' })
      return
    }

    const statement = await getAccountLedgerStatement(
      accountId,
      startDate ? String(startDate) : undefined,
      endDate ? String(endDate) : undefined,
    )

    const account = await BillingAccount.findByPk(accountId)

    res.json({
      success: true,
      data: {
        accountId,
        creditBalance: account?.creditBalance || 0,
        entries: statement,
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get ledger statement')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── 7. BATCH BILLING RUNS ───────────────────────────────────────────────────

export async function triggerBatchRun(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = triggerBillingRunSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const data = parseResult.data
    const companyId = data.companyId || req.user?.companyId || undefined
    const runBy = req.user?.id

    // If synchronous preview requested or Redis disabled, execute directly
    if (data.runType === BillingRunType.PREVIEW || req.query.sync === 'true') {
      const result = await processBatchBilling({
        propertyId: data.propertyId,
        companyId,
        periodStart: data.billingPeriodStart,
        periodEnd: data.billingPeriodEnd,
        runType: data.runType,
        runBy,
      })
      res.json({ success: true, data: result })
      return
    }

    // Try enqueuing to BullMQ, with direct execution fallback
    try {
      const queue = getBillingQueue()
      const job = await queue.add('batch-billing-run', {
        propertyId: data.propertyId,
        companyId,
        periodStart: data.billingPeriodStart,
        periodEnd: data.billingPeriodEnd,
        runType: data.runType,
        runBy,
      })

      res.status(202).json({
        success: true,
        message: 'Batch billing run queued successfully',
        jobId: job.id,
      })
    } catch (queueErr) {
      logger.warn({ error: queueErr }, 'Queue unavailable, executing batch run directly')
      const result = await processBatchBilling({
        propertyId: data.propertyId,
        companyId,
        periodStart: data.billingPeriodStart,
        periodEnd: data.billingPeriodEnd,
        runType: data.runType,
        runBy,
      })
      res.json({ success: true, data: result })
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    logger.error({ error }, 'Failed to trigger batch billing run')
    res.status(500).json({ success: false, message: msg })
  }
}

export async function getBillingRuns(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { propertyId } = req.query
    const targetPropertyId = (req.params.locationId || propertyId || req.query.locationId) as string | undefined

    const where: Record<string, unknown> = {}
    if (targetPropertyId && targetPropertyId !== 'ALL' && targetPropertyId !== 'all') {
      where.propertyId = String(targetPropertyId)
    }

    const runs = await BillingRun.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 50,
    })

    res.json({ success: true, data: runs })
  } catch (error) {
    logger.error({ error }, 'Failed to get billing runs')
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getUnitsBillingSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const targetPropertyId = (req.params.locationId || req.query.propertyId || req.query.locationId) as
      string | undefined

    let propId: string | undefined
    if (targetPropertyId && targetPropertyId !== 'ALL' && targetPropertyId !== 'all') {
      propId = targetPropertyId
    } else {
      const defaultProp = await Property.findOne({ where: { isDeleted: false }, order: [['createdAt', 'ASC']] })
      propId = defaultProp?.id
    }

    if (!propId) {
      res.json({ success: true, data: [] })
      return
    }

    const units = await PropertyUnit.findAll({
      where: { isDeleted: false },
      include: [
        {
          model: PropertyFloor,
          as: 'floor',
          required: true,
          include: [
            {
              model: PropertyBlock,
              as: 'block',
              required: true,
              where: { propertyId: propId },
            },
          ],
        },
        {
          model: Resident,
          as: 'residents',
          required: false,
          where: { isDeleted: false },
          attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'photoUrl', 'residentType', 'isResiding'],
        },
        {
          model: UnitResident,
          as: 'unitResidents',
          required: false,
          where: { isActive: true },
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'photoUrl', 'residentType'],
            },
          ],
        },
        {
          model: BillingAccount,
          as: 'billingAccounts',
          required: false,
          where: { isDeleted: false },
          include: [
            {
              model: BillingParty,
              as: 'parties',
              required: false,
              where: { isActive: true },
            },
            {
              model: BillingSubscription,
              as: 'subscriptions',
              required: false,
              where: { status: SubscriptionStatus.ACTIVE },
              attributes: ['id', 'status', 'quantity', 'billingFrequency'],
            },
            {
              model: Invoice,
              as: 'invoices',
              required: false,
              attributes: ['id', 'status', 'grandTotal', 'amountDue'],
            },
          ],
        },
      ],
      order: [['unit_number', 'ASC']],
    })

    const summary = units.map((u) => {
      const uJson = u.toJSON() as any
      const folio = uJson.billingAccounts?.[0] || null
      const primaryBillingResidentAssoc = uJson.unitResidents?.find((r: any) => r.isPrimary) || uJson.unitResidents?.[0]
      const corePrimaryResident = uJson.residents?.find((r: any) => r.isResiding) || uJson.residents?.[0] || null
      const primaryResident = primaryBillingResidentAssoc?.resident || corePrimaryResident || null
      const primaryPayer =
        folio?.parties?.find((p: any) => p.role === BillingPartyRole.PRIMARY_PAYER && p.isActive) || null

      const invoices = folio?.invoices || []
      const totalInvoiced = invoices.reduce((acc: number, inv: any) => acc + Number(inv.grandTotal || 0), 0)
      const totalOutstanding = invoices
        .filter(
          (inv: any) =>
            inv.status !== 'PAID' && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT' && inv.status !== 'PREVIEW',
        )
        .reduce((acc: number, inv: any) => acc + Number(inv.amountDue || 0), 0)

      const activeSubscriptionsCount = folio?.subscriptions?.length || 0

      // Map occupants from both billing_unit_residents and core residents
      const billingOccupants = (uJson.unitResidents || []).map((ur: any) => ({
        id: ur.resident?.id,
        name: `${ur.resident?.firstName || ''} ${ur.resident?.lastName || ''}`.trim(),
        phone: ur.resident?.phone,
        email: ur.resident?.email,
        relationship: ur.relationshipType,
        isPrimary: ur.isPrimary,
      }))

      const coreOccupants = (uJson.residents || []).map((r: any) => ({
        id: r.id,
        name: `${r.firstName || ''} ${r.lastName || ''}`.trim(),
        phone: r.phone,
        email: r.email,
        relationship: r.residentType || 'RESIDENT',
        isPrimary: Boolean(r.isResiding),
      }))

      const allOccupantsMap = new Map<string, any>()
      for (const occ of [...billingOccupants, ...coreOccupants]) {
        if (occ.id && !allOccupantsMap.has(occ.id)) {
          allOccupantsMap.set(occ.id, occ)
        }
      }
      const mergedResidents = Array.from(allOccupantsMap.values())

      const rawOccupancy = uJson.occupancyStatus || 'VACANT'
      const isOccupied = rawOccupancy !== 'VACANT' || !!primaryResident
      const finalOccupancyStatus = isOccupied ? (rawOccupancy !== 'VACANT' ? rawOccupancy : 'OCCUPIED') : 'VACANT'

      return {
        id: uJson.id,
        unitId: uJson.id,
        unitNumber: uJson.unit_number,
        unitType: uJson.unit_type,
        occupancyStatus: finalOccupancyStatus,
        floorNumber: uJson.floor?.floor_number,
        blockName: uJson.floor?.block?.block_name,
        residents: mergedResidents,
        primaryResident: primaryResident
          ? {
              id: primaryResident.id,
              name: `${primaryResident.firstName || ''} ${primaryResident.lastName || ''}`.trim(),
              phone: primaryResident.phone,
              email: primaryResident.email,
              relationship: primaryBillingResidentAssoc?.relationshipType || primaryResident.residentType || 'RESIDENT',
            }
          : null,
        folio: folio
          ? {
              id: folio.id,
              accountNumber: folio.accountNumber,
              accountName: folio.accountName,
              billingMode: folio.billingMode,
              status: folio.status,
              creditBalance: Number(folio.creditBalance || 0),
            }
          : null,
        primaryPayer: primaryPayer
          ? {
              id: primaryPayer.id,
              name: primaryPayer.partyName,
              email: primaryPayer.partyEmail,
              phone: primaryPayer.partyPhone,
              role: primaryPayer.role,
            }
          : null,
        financialMetrics: {
          totalInvoiced,
          totalOutstanding,
          activeSubscriptionsCount,
          invoicesCount: invoices.length,
        },
      }
    })

    res.json({ success: true, data: summary })
  } catch (error) {
    logger.error({ error }, 'Failed to get units billing summary')
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Internal server error' })
  }
}

/**
 * Automatically ensures an occupied unit has an active BillingAccount (folio)
 * and syncs recurring subscriptions from external modules (e.g. FnbResidentPackage).
 */
export async function syncUnitFolioAndSubscriptions(unit: any, primaryResident: any): Promise<BillingAccount | null> {
  let folio = await BillingAccount.findOne({
    where: { unitId: unit.id, isDeleted: false },
    include: [
      { model: BillingParty, as: 'parties', where: { isActive: true }, required: false },
      { model: Resident, as: 'primaryResident' },
    ],
  })

  // Robust property ID resolution across block associations, unit, or resident
  let locId =
    (unit as any).floor?.block?.propertyId ||
    (unit as any).floor?.block?.locId ||
    primaryResident?.locId ||
    primaryResident?.propertyId ||
    (unit as any).propertyId ||
    null

  if (!locId && unit.floorId) {
    const floor = await PropertyFloor.findByPk(unit.floorId, {
      include: [{ model: PropertyBlock, as: 'block' }],
    })
    locId = (floor as any)?.block?.propertyId || (floor as any)?.block?.locId || null
  }

  let companyId: string | null = primaryResident?.companyId || null
  if (locId) {
    const prop = await Property.findByPk(locId)
    if (prop?.companyId) companyId = prop.companyId
  }
  if (!companyId) {
    const company = await Company.findOne({ where: { isDeleted: false } })
    companyId = company?.id || null
  }

  if (!folio && primaryResident && locId && companyId) {
    const unitLabel = unit.unit_number?.replace(/[^a-zA-Z0-9]/g, '') || 'UNIT'
    const suffix = Math.floor(1000 + Math.random() * 9000)
    const accountNumber = `BA-${unitLabel}-${suffix}`

    folio = await BillingAccount.create({
      unitId: unit.id,
      propertyId: locId,
      companyId,
      primaryResidentId: primaryResident.id,
      accountName: `Flat ${unit.unit_number} — Master Folio`,
      billingMode: 'INDIVIDUAL' as any,
      billingCycle: 'MONTHLY' as any,
      billingDay: 1,
      currency: 'INR',
      status: 'ACTIVE' as any,
      creditBalance: 0,
      accountNumber,
    })

    const residentName =
      `${primaryResident.firstName || ''} ${primaryResident.lastName || ''}`.trim() ||
      primaryResident.name ||
      'Primary Resident'

    await BillingParty.create({
      billingAccountId: folio.id,
      partyType: BillingPartyType.RESIDENT,
      residentId: primaryResident.id,
      partyName: residentName,
      partyEmail: primaryResident.email || null,
      partyPhone: primaryResident.phone || null,
      role: BillingPartyRole.PRIMARY_PAYER,
      isDefault: true,
      isActive: true,
    })

    folio = await BillingAccount.findByPk(folio.id, {
      include: [
        { model: BillingParty, as: 'parties', where: { isActive: true }, required: false },
        { model: Resident, as: 'primaryResident' },
      ],
    })
  }

  if (folio) {
    const billingOccupants = ((unit as any).unitResidents || []).map((ur: any) => ur.resident?.id).filter(Boolean)
    const coreOccupants = ((unit as any).residents || []).map((r: any) => r.id).filter(Boolean)
    const residentIds = Array.from(
      new Set([...billingOccupants, ...coreOccupants, primaryResident?.id].filter(Boolean)),
    )

    if (residentIds.length > 0) {
      const activeFnbPackages = await FnbResidentPackage.findAll({
        where: {
          residentId: residentIds,
          status: ['active', 'ACTIVE'],
        },
        include: [
          {
            model: FnbPropertyPackage,
            as: 'propertyPackage',
            include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
          },
        ],
      })

      if (activeFnbPackages.length > 0) {
        let foodProduct = await BillingProduct.findOne({
          where: { category: 'FOOD', chargeType: 'SUBSCRIPTION', isActive: true },
        })
        if (!foodProduct) {
          foodProduct = await BillingProduct.findOne({ where: { category: 'FOOD' } })
        }
        if (!foodProduct && folio.companyId) {
          foodProduct = await BillingProduct.create({
            companyId: folio.companyId,
            category: BillingProductCategory.FOOD,
            chargeType: ChargeType.SUBSCRIPTION,
            productCode: 'PROD-FOOD-PKG',
            productName: 'Food Package Subscription',
            description: 'Monthly Food Package Subscription',
            isTaxable: true,
            defaultTaxRate: 5,
            isActive: true,
          })
        }

        for (const fnbSub of activeFnbPackages) {
          const propPkg = (fnbSub as any).propertyPackage
          const globalPkg = propPkg?.globalPackage
          const pkgName = globalPkg?.name || 'Food Package'
          const price = Number(fnbSub.totalPrice || propPkg?.price || 0)

          const existingBillingSub = await BillingSubscription.findOne({
            where: { fnbPackageId: fnbSub.id },
          })

          if (!existingBillingSub && foodProduct) {
            await BillingSubscription.create({
              billingAccountId: folio.id,
              unitId: unit.id,
              productId: foodProduct.id,
              description: pkgName,
              quantity: 1,
              unitPrice: price,
              billingFrequency: 'MONTHLY' as any,
              prorationPolicy: 'DAILY' as any,
              startDate: fnbSub.startDate,
              endDate: fnbSub.endDate || null,
              fnbPackageId: fnbSub.id,
              status: SubscriptionStatus.ACTIVE,
              isActive: true,
            })
          } else if (existingBillingSub) {
            if (
              existingBillingSub.status !== SubscriptionStatus.ACTIVE ||
              !existingBillingSub.isActive ||
              existingBillingSub.billingAccountId !== folio.id ||
              Number(existingBillingSub.unitPrice) !== price
            ) {
              await existingBillingSub.update({
                billingAccountId: folio.id,
                status: SubscriptionStatus.ACTIVE,
                isActive: true,
                unitPrice: price,
                description: pkgName,
              })
            }
          }
        }
      }

      const linkedBillingSubs = await BillingSubscription.findAll({
        where: { billingAccountId: folio.id, fnbPackageId: { [Op.ne]: null } },
      })
      for (const bs of linkedBillingSubs) {
        if (bs.fnbPackageId) {
          const fnbPkg = await FnbResidentPackage.findByPk(bs.fnbPackageId)
          if (!fnbPkg || fnbPkg.status === 'cancelled' || fnbPkg.status === 'completed') {
            if (bs.status !== SubscriptionStatus.CANCELLED) {
              await bs.update({ status: SubscriptionStatus.CANCELLED, isActive: false })
            }
          } else if (fnbPkg.status === 'paused' && bs.status !== SubscriptionStatus.PAUSED) {
            await bs.update({ status: SubscriptionStatus.PAUSED })
          }
        }
      }

      // 2. Sync Care Packages into BillingSubscription
      const activeCarePackages = await PackageSubscription.findAll({
        where: {
          residentId: residentIds,
          status: SubscriptionStatus.ACTIVE,
          isDeleted: false,
        },
        include: [{ model: Package, as: 'carePackage' }],
      })

      if (activeCarePackages.length > 0) {
        let careProduct = await BillingProduct.findOne({
          where: { category: BillingProductCategory.CARE, chargeType: ChargeType.SUBSCRIPTION, isActive: true },
        })
        if (!careProduct) {
          careProduct = await BillingProduct.findOne({ where: { category: BillingProductCategory.CARE } })
        }
        if (!careProduct && folio.companyId) {
          careProduct = await BillingProduct.create({
            companyId: folio.companyId,
            category: BillingProductCategory.CARE,
            chargeType: ChargeType.SUBSCRIPTION,
            productCode: 'PROD-CARE-PKG',
            productName: 'Care Package Subscription',
            description: 'Monthly Care Package Subscription',
            isTaxable: false,
            defaultTaxRate: 0,
            isActive: true,
          })
        }

        if (careProduct) {
          for (const careSub of activeCarePackages) {
            const pkg = (careSub as any).carePackage
            const pkgName = pkg?.packageName || 'Care Package'
            const price = Number(pkg?.packageCost || careSub.totalCost || 0)

            const existingCareSub = await BillingSubscription.findOne({
              where: {
                billingAccountId: folio.id,
                productId: careProduct.id,
                description: { [Op.like]: `%${pkgName}%` },
              },
            })

            if (!existingCareSub) {
              await BillingSubscription.create({
                billingAccountId: folio.id,
                unitId: unit.id,
                productId: careProduct.id,
                description: `Care Package (${pkgName})`,
                quantity: 1,
                unitPrice: price,
                billingFrequency: 'MONTHLY' as any,
                prorationPolicy: 'DAILY' as any,
                startDate: careSub.startDate,
                endDate: careSub.endDate || null,
                status: SubscriptionStatus.ACTIVE,
                isActive: true,
              })
            } else if (existingCareSub) {
              if (existingCareSub.status !== SubscriptionStatus.ACTIVE || Number(existingCareSub.unitPrice) !== price) {
                await existingCareSub.update({
                  status: SubscriptionStatus.ACTIVE,
                  unitPrice: price,
                  description: `Care Package (${pkgName})`,
                })
              }
            }
          }
        }
      }

      // 3. Sync Care Tasks (AdditionalTaskCharge) as unbilled BillingEvents
      const additionalTaskCharges = await AdditionalTaskCharge.findAll({
        where: {
          residentId: residentIds,
          isDeleted: false,
        },
        include: [{ model: CareTask, as: 'feature' }],
      })

      if (additionalTaskCharges.length > 0) {
        let careTaskProduct = await BillingProduct.findOne({
          where: { category: BillingProductCategory.CARE, chargeType: ChargeType.USAGE, isActive: true },
        })
        if (!careTaskProduct && folio.companyId) {
          careTaskProduct = await BillingProduct.create({
            companyId: folio.companyId,
            category: BillingProductCategory.CARE,
            chargeType: ChargeType.USAGE,
            productCode: 'PROD-CARE-TASK',
            productName: 'Additional Care Task',
            description: 'Additional Care Task Session',
            isTaxable: false,
            defaultTaxRate: 0,
            isActive: true,
          })
        }

        if (careTaskProduct) {
          for (const charge of additionalTaskCharges) {
            const existingEvent = await BillingEvent.findOne({
              where: {
                sourceModule: BillingEventSourceModule.CARE,
                sourceId: charge.id,
              },
            })

            if (!existingEvent) {
              const unitPrice =
                charge.unitPrice && Number(charge.unitPrice) > 0 ? Number(charge.unitPrice) : Number(charge.price)
              const qty = unitPrice > 0 ? Math.round(Number(charge.price) / unitPrice) || 1 : 1
              const taskName = charge.taskName || charge.feature?.careTaskName || 'Additional Care Task'
              const serviceDate = charge.completedAt
                ? new Date(charge.completedAt).toISOString().slice(0, 10)
                : new Date(charge.createdAt).toISOString().slice(0, 10)

              await BillingEvent.create({
                billingAccountId: folio.id,
                unitId: unit.id,
                residentId: charge.residentId,
                propertyId: folio.propertyId,
                sourceModule: BillingEventSourceModule.CARE,
                sourceType: 'ADDITIONAL_TASK',
                sourceId: charge.id,
                productId: careTaskProduct.id,
                chargeType: 'USAGE',
                description: taskName,
                quantity: qty,
                unitPrice,
                amount: Number(charge.price),
                serviceDate,
                status: BillingEventStatus.PENDING,
              })
            }
          }
        }
      }

      // 4. Sync Inventory items assigned to residents as unbilled BillingEvents
      const inventoryTransactions = await InventoryStockTransaction.findAll({
        where: {
          residentId: residentIds,
          transactionType: 'issue',
        },
        include: [{ model: InventoryStockTransactionLine, as: 'lines' }],
      })

      if (inventoryTransactions.length > 0) {
        let consumableProduct = await BillingProduct.findOne({
          where: { category: BillingProductCategory.CONSUMABLE, chargeType: ChargeType.USAGE, isActive: true },
        })
        if (!consumableProduct && folio.companyId) {
          consumableProduct = await BillingProduct.create({
            companyId: folio.companyId,
            category: BillingProductCategory.CONSUMABLE,
            chargeType: ChargeType.USAGE,
            productCode: 'PROD-CONSUMABLE',
            productName: 'Inventory Consumable',
            description: 'Inventory Consumable Item',
            isTaxable: false,
            defaultTaxRate: 0,
            isActive: true,
          })
        }

        if (consumableProduct) {
          for (const tx of inventoryTransactions) {
            const lines = (tx as any).lines || []
            for (const line of lines) {
              const packQty = Number(line.packQuantity) && Number(line.packQuantity) > 0 ? Number(line.packQuantity) : 1
              const baseUnitPrice = Math.round((Number(line.mrpPrice) / packQty) * 100) / 100
              const lineAmount = Math.round((Number(line.quantity) / packQty) * Number(line.mrpPrice) * 100) / 100
              const unitLabel = line.packUnit ? ` ${line.packUnit}` : ''
              const desc = `${line.itemName || 'Inventory Item'}${unitLabel}${line.batchNumber ? ` (Batch: ${line.batchNumber})` : ''}`
              const serviceDate = tx.date
                ? new Date(tx.date).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10)

              const existingEvent = await BillingEvent.findOne({
                where: {
                  sourceModule: BillingEventSourceModule.INVENTORY,
                  sourceId: line.id,
                },
              })

              if (!existingEvent) {
                await BillingEvent.create({
                  billingAccountId: folio.id,
                  unitId: unit.id,
                  residentId: tx.residentId!,
                  propertyId: folio.propertyId,
                  sourceModule: BillingEventSourceModule.INVENTORY,
                  sourceType: 'INVENTORY_ISSUE',
                  sourceId: line.id,
                  productId: consumableProduct.id,
                  chargeType: 'USAGE',
                  description: desc,
                  quantity: Number(line.quantity),
                  unitPrice: baseUnitPrice,
                  amount: lineAmount,
                  serviceDate,
                  status: BillingEventStatus.PENDING,
                })
              } else if (existingEvent.status === BillingEventStatus.PENDING) {
                await existingEvent.update({
                  quantity: Number(line.quantity),
                  unitPrice: baseUnitPrice,
                  amount: lineAmount,
                })
              }
            }
          }
        }
      }
    }
  }

  return folio
}

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
        },
        {
          model: UnitResident,
          as: 'unitResidents',
          where: { isActive: true },
          required: false,
          include: [{ model: Resident, as: 'resident' }],
        },
      ],
    })

    if (!unit) {
      res.status(404).json({ success: false, message: 'Unit not found' })
      return
    }

    // Combine occupants from billing_unit_residents and core residents
    const billingOccupants = ((unit as any).unitResidents || []).map((ur: any) => ({
      id: ur.resident?.id,
      name: `${ur.resident?.firstName || ''} ${ur.resident?.lastName || ''}`.trim(),
      firstName: ur.resident?.firstName,
      lastName: ur.resident?.lastName,
      email: ur.resident?.email,
      phone: ur.resident?.phone,
      locId: ur.resident?.locId,
      companyId: ur.resident?.companyId,
      relationship: ur.relationshipType,
      isPrimary: ur.isPrimary,
      photoUrl: ur.resident?.photoUrl,
    }))

    const coreOccupants = ((unit as any).residents || []).map((r: any) => ({
      id: r.id,
      name: `${r.firstName || ''} ${r.lastName || ''}`.trim(),
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      locId: r.locId,
      companyId: r.companyId,
      relationship: r.residentType || 'RESIDENT',
      isPrimary: Boolean(r.isResiding),
      photoUrl: r.photoUrl,
    }))

    const occupantsMap = new Map<string, any>()
    for (const occ of [...billingOccupants, ...coreOccupants]) {
      if (occ.id && !occupantsMap.has(occ.id)) {
        occupantsMap.set(occ.id, occ)
      }
    }
    const occupants = Array.from(occupantsMap.values())
    const primaryResident = occupants.find((r) => r.isPrimary) || occupants[0] || null

    // Auto-sync folio and subscriptions
    const folio = await syncUnitFolioAndSubscriptions(unit, primaryResident)

    let subscriptions: any[] = []
    let invoices: any[] = []
    let pendingEvents: any[] = []
    let ledgerStatement: any[] = []

    if (folio) {
      subscriptions = await BillingSubscription.findAll({
        where: { billingAccountId: folio.id, isActive: true },
        include: [
          { model: BillingProduct, as: 'product' },
          { model: BillingPricePlan, as: 'pricePlan' },
        ],
        order: [['createdAt', 'DESC']],
      })

      invoices = await Invoice.findAll({
        where: { billingAccountId: folio.id },
        include: [{ model: InvoiceLine, as: 'lines' }],
        order: [['createdAt', 'DESC']],
      })

      pendingEvents = await BillingEvent.findAll({
        where: { billingAccountId: folio.id, status: BillingEventStatus.PENDING },
        include: [
          { model: BillingProduct, as: 'product' },
          { model: Resident, as: 'resident' },
        ],
        order: [['serviceDate', 'DESC']],
      })

      ledgerStatement = await getAccountLedgerStatement(folio.id)
    }

    const rawOccupancy = unit.occupancyStatus || 'VACANT'
    const isOccupied = rawOccupancy !== 'VACANT' || occupants.length > 0
    const finalOccupancy = isOccupied ? (rawOccupancy !== 'VACANT' ? rawOccupancy : 'OCCUPIED') : 'VACANT'

    res.json({
      success: true,
      data: {
        unit: {
          id: unit.id,
          unitNumber: unit.unit_number,
          unitType: unit.unit_type,
          occupancyStatus: finalOccupancy,
          floorNumber: (unit as any).floor?.floor_number,
          blockName: (unit as any).floor?.block?.block_name,
        },
        occupants,
        folio: folio || null,
        subscriptions,
        invoices,
        pendingEvents,
        ledger: {
          creditBalance: Number(folio?.creditBalance || 0),
          entries: ledgerStatement,
        },
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get unit 360 billing details')
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Internal server error' })
  }
}

// ── 7. GLOBAL GST / TAX SETTINGS ────────────────────────────────────────────

export async function getTaxSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const company = await Company.findOne({ where: { isDeleted: false } })
    const companyId = company?.id

    let gstEnabled = true
    let defaultTaxRate = 18
    let cgstRate = 9
    let sgstRate = 9
    let igstRate = 18

    if (companyId) {
      const customFields = await CompanyCustomField.findAll({
        where: { companyId, isDeleted: false },
      })
      for (const cf of customFields) {
        if (cf.fieldName === 'gst_enabled') gstEnabled = cf.fieldValue !== 'false'
        if (cf.fieldName === 'gst_rate') defaultTaxRate = Number(cf.fieldValue) || 18
        if (cf.fieldName === 'cgst_rate') cgstRate = Number(cf.fieldValue) || 9
        if (cf.fieldName === 'sgst_rate') sgstRate = Number(cf.fieldValue) || 9
        if (cf.fieldName === 'igst_rate') igstRate = Number(cf.fieldValue) || 18
      }
    }

    res.json({
      success: true,
      data: {
        gstEnabled,
        defaultTaxRate,
        cgstRate,
        sgstRate,
        igstRate,
        companyGstNumber: company?.company_gst_number || '',
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    logger.error({ error }, 'Failed to get tax settings')
    res.status(500).json({ success: false, message: msg })
  }
}

export async function updateTaxSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parseResult = taxSettingsSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.flatten().fieldErrors })
      return
    }

    const { gstEnabled, defaultTaxRate, cgstRate, sgstRate, companyGstNumber } = parseResult.data

    const company = await Company.findOne({ where: { isDeleted: false } })
    if (!company) {
      res.status(404).json({ success: false, message: 'No active company profile found' })
      return
    }

    if (companyGstNumber !== undefined && companyGstNumber !== null) {
      company.company_gst_number = companyGstNumber
      await company.save()
    }

    const fieldsToUpsert: Array<{ fieldName: string; fieldLabel: string; fieldValue: string }> = [
      { fieldName: 'gst_enabled', fieldLabel: 'GST Enabled', fieldValue: String(gstEnabled) },
      { fieldName: 'gst_rate', fieldLabel: 'Default GST Rate (%)', fieldValue: String(defaultTaxRate) },
      { fieldName: 'cgst_rate', fieldLabel: 'CGST Rate (%)', fieldValue: String(cgstRate) },
      { fieldName: 'sgst_rate', fieldLabel: 'SGST Rate (%)', fieldValue: String(sgstRate) },
      { fieldName: 'igst_rate', fieldLabel: 'IGST Rate (%)', fieldValue: String(cgstRate + sgstRate) },
    ]

    for (const f of fieldsToUpsert) {
      const existing = await CompanyCustomField.findOne({
        where: { companyId: company.id, fieldName: f.fieldName, isDeleted: false },
      })
      if (existing) {
        existing.fieldValue = f.fieldValue
        await existing.save()
      } else {
        await CompanyCustomField.create({
          companyId: company.id,
          fieldName: f.fieldName,
          fieldLabel: f.fieldLabel,
          fieldType: 'number',
          fieldValue: f.fieldValue,
          isActive: true,
          isDeleted: false,
          createdBy: req.user?.id || null,
          updatedBy: req.user?.id || null,
        })
      }
    }

    res.json({
      success: true,
      message: 'Global GST tax settings updated successfully',
      data: {
        gstEnabled,
        defaultTaxRate,
        cgstRate,
        sgstRate,
        igstRate: cgstRate + sgstRate,
        companyGstNumber: company.company_gst_number || '',
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    logger.error({ error }, 'Failed to update tax settings')
    res.status(500).json({ success: false, message: msg })
  }
}
