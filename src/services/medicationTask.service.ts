import { randomUUID } from 'node:crypto'
import { Op, UniqueConstraintError, fn, col, type WhereOptions } from 'sequelize'
import { HttpError } from '../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../middlewares/s3/index.js'
import {
  InventoryItem,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentInsulin,
  ResidentMedication,
  ResidentMedicationAdministration,
} from '../models/index.js'
import { InventoryStock } from '../models/inventoryStock.model.js'
import type { ConsultantFileEntry, ConsultantFileType } from '../models/consultant.model.js'
import type { MedicationTimeOfDay, MedicationTiming } from '../models/residentMedication.model.js'
import { MedicationAdministrationStatus, MedicationKind, MedicationStockStatus } from '../enums/medication.enum.js'
import { WHOLE_PACKAGE_TYPES } from '../validations/center-inventory.validation.js'
import type {
  CancelMedicationTaskInput,
  CompleteMedicationTaskInput,
  ListMedicationAdministrationsQuery,
} from '../validations/medicationTask.validation.js'
import {
  doesResidentMatchShiftScope,
  isTimeInShiftWindow,
  type EmployeeShiftScope,
} from '../mobile-app/L3/controllers/medical.controller.js'
import { assignItems, stockDisplay } from './center-inventory.service.js'
import { userInclude, userName } from './residentCondition.service.js'

export const MAX_MEDICATION_TASK_PHOTOS = 5
export const MAX_MEDICATION_TASK_VOICE_NOTES = 1

const TIME_OF_DAY_ORDER: MedicationTimeOfDay[] = ['morning', 'afternoon', 'evening', 'night']

/**
 * Nurse visibility for medication tasks. `null` fields mean unrestricted (admin).
 */
export interface MedicationTaskScope {
  residentIds: string[] | null
  shifts: EmployeeShiftScope[] | null
}

export interface MedicationTaskFiles {
  photos: Express.Multer.File[]
  voiceNotes: Express.Multer.File[]
}

type MedicationRow = ResidentMedication | ResidentInsulin

interface ResidentSummary {
  id: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  unitId: string | null
  unitNumber: string | null
  blockName: string | null
}

const residentInclude = {
  model: Resident,
  as: 'resident',
  attributes: ['id', 'firstName', 'lastName', 'phone', 'locId', 'unitId', 'isResiding'],
  where: { isDeleted: false, isResiding: true },
  required: true,
  include: [
    {
      model: PropertyUnit,
      as: 'unit',
      attributes: ['id', 'unit_number', 'floorId'],
      required: false,
      include: [
        {
          model: PropertyFloor,
          as: 'floor',
          attributes: ['id', 'floor_name', 'blockId'],
          required: false,
          include: [{ model: PropertyBlock, as: 'block', attributes: ['id', 'block_name'], required: false }],
        },
      ],
    },
  ],
}

const inventoryItemInclude = {
  model: InventoryItem,
  as: 'inventoryItem',
  attributes: ['id', 'name', 'packType', 'packUnit', 'packQuantity'],
  required: false,
}

function modelFor(kind: MedicationKind) {
  return kind === MedicationKind.INSULIN ? ResidentInsulin : ResidentMedication
}

function isWholePack(packType: string | null | undefined): boolean {
  return (WHOLE_PACKAGE_TYPES as readonly string[]).includes(String(packType || '').toLowerCase())
}

function isActiveOn(row: { startDate: string; endDate: string | null; isUntilDischarge: boolean }, date: string) {
  if (row.startDate > date) return false
  return row.isUntilDischarge || !row.endDate || row.endDate >= date
}

function slotKey(kind: string, medicationId: string, timeOfDay: string): string {
  return `${kind}:${medicationId}:${timeOfDay}`
}

function selectedTimings(row: MedicationRow): MedicationTiming[] {
  const timings = Array.isArray(row.timings) ? row.timings : []
  return timings
    .filter((t) => t?.selected)
    .sort((a, b) => TIME_OF_DAY_ORDER.indexOf(a.timeOfDay) - TIME_OF_DAY_ORDER.indexOf(b.timeOfDay))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toResidentSummary(resident: any): ResidentSummary | null {
  if (!resident) return null
  return {
    id: resident.id,
    firstName: resident.firstName || null,
    lastName: resident.lastName || null,
    phone: resident.phone || null,
    unitId: resident.unitId || null,
    unitNumber: resident.unit?.unit_number || null,
    blockName: resident.unit?.floor?.block?.block_name || null,
  }
}

function residentName(resident: ResidentSummary | null): string {
  return resident ? `${resident.firstName || ''} ${resident.lastName || ''}`.trim() : ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSlotVisible(resident: any, time: string, shifts: EmployeeShiftScope[] | null): boolean {
  if (!shifts) return true
  return shifts.some(
    (s) => doesResidentMatchShiftScope(resident, s) && isTimeInShiftWindow(time, s.startMinutes, s.endMinutes),
  )
}

function formatQuantity(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 100) / 100
  return `${rounded} ${unit}`
}

function consumedDisplay(totalDose: number, item: { packType?: string; packUnit?: string } | null | undefined) {
  if (!item || isWholePack(item.packType)) return formatQuantity(totalDose, totalDose === 1 ? 'dose' : 'doses')
  return formatQuantity(totalDose, item.packUnit || 'unit')
}

export function formatAdministrationRow(row: ResidentMedicationAdministration) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (row.toJSON ? row.toJSON() : row) as any
  const resident = toResidentSummary(data.resident)
  return {
    id: data.id,
    kind: data.kind,
    medicationId: data.medicationId,
    residentId: data.residentId,
    locationId: data.locationId,
    inventoryItemId: data.inventoryItemId,
    medicineName: data.medicineName,
    timeOfDay: data.timeOfDay,
    scheduledDate: data.scheduledDate,
    scheduledTime: data.scheduledTime,
    dose: Number(data.dose) || 0,
    route: data.route,
    mealTiming: data.mealTiming,
    status: data.status,
    completedAt: data.completedAt,
    completedBy: data.completedBy,
    nurseName: userName(row.completedByUser),
    notes: data.notes || null,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    voiceNotes: Array.isArray(data.voiceNotes) ? data.voiceNotes : [],
    cancelledAt: data.cancelledAt || null,
    cancelledBy: data.cancelledBy || null,
    cancelledByName: userName(row.cancelledByUser),
    cancelReason: data.cancelReason || null,
    cancelAttachments: Array.isArray(data.cancelAttachments) ? data.cancelAttachments : [],
    cancelVoiceNotes: Array.isArray(data.cancelVoiceNotes) ? data.cancelVoiceNotes : [],
    stockStatus: data.stockStatus,
    deductedQuantity: Number(data.deductedQuantity) || 0,
    stockTransactionId: data.stockTransactionId || null,
    packUnit: data.inventoryItem?.packUnit || null,
    isWholePack: isWholePack(data.inventoryItem?.packType),
    resident,
    residentName: residentName(resident),
  }
}

async function loadActiveMedications(params: {
  targetDate: string
  locationId: string | null
  scope: MedicationTaskScope
}) {
  const { targetDate, locationId, scope } = params
  const where: WhereOptions = {
    isDeleted: false,
    isActive: true,
    startDate: { [Op.lte]: targetDate },
    [Op.or]: [{ isUntilDischarge: true }, { endDate: null }, { endDate: { [Op.gte]: targetDate } }],
    ...(scope.residentIds ? { residentId: { [Op.in]: scope.residentIds } } : {}),
    ...(locationId ? { locationId } : {}),
  }
  const options = {
    where,
    include: [residentInclude, inventoryItemInclude],
    order: [['createdAt', 'ASC']] as [string, string][],
  }
  const [medications, insulin] = await Promise.all([
    ResidentMedication.findAll(options),
    ResidentInsulin.findAll(options),
  ])
  return [
    ...medications.map((row) => ({ kind: MedicationKind.MEDICATION, row: row as MedicationRow })),
    ...insulin.map((row) => ({ kind: MedicationKind.INSULIN, row: row as MedicationRow })),
  ]
}

function completedWhere(params: {
  targetDate: string
  locationId: string | null
  scope: MedicationTaskScope
  nurseId: string | null
}): WhereOptions {
  return {
    isDeleted: false,
    scheduledDate: params.targetDate,
    ...(params.nurseId ? { [Op.or]: [{ completedBy: params.nurseId }, { cancelledBy: params.nurseId }] } : {}),
    ...(params.locationId ? { locationId: params.locationId } : {}),
    ...(params.scope.residentIds ? { residentId: { [Op.in]: params.scope.residentIds } } : {}),
  }
}

/**
 * One group per medication with its slots for `targetDate`. Slots are derived from the row's
 * selected timings; a slot is pending until an administration row exists for that date.
 */
async function buildMedicationGroups(
  entries: Array<{ kind: MedicationKind; row: MedicationRow }>,
  targetDate: string,
  shifts: EmployeeShiftScope[] | null,
) {
  const medicationIds = entries.map((e) => e.row.id)

  const [todayAdministrations, consumedRows, stocks] = await Promise.all([
    medicationIds.length
      ? ResidentMedicationAdministration.findAll({
          where: { isDeleted: false, scheduledDate: targetDate, medicationId: { [Op.in]: medicationIds } },
          include: [userInclude('completedByUser'), userInclude('cancelledByUser')],
        })
      : [],
    medicationIds.length
      ? (ResidentMedicationAdministration.findAll({
          where: {
            isDeleted: false,
            status: MedicationAdministrationStatus.COMPLETED,
            medicationId: { [Op.in]: medicationIds },
          },
          attributes: ['kind', 'medicationId', [fn('SUM', col('dose')), 'totalDose']],
          group: ['kind', 'medicationId'],
          raw: true,
        }) as unknown as Promise<Array<{ kind: string; medicationId: string; totalDose: string | number }>>)
      : [],
    entries.length
      ? InventoryStock.findAll({
          where: {
            locationId: { [Op.in]: [...new Set(entries.map((e) => e.row.locationId))] },
            itemId: { [Op.in]: [...new Set(entries.map((e) => e.row.inventoryItemId))] },
          },
        })
      : [],
  ])

  const administrationMap = new Map(todayAdministrations.map((a) => [slotKey(a.kind, a.medicationId, a.timeOfDay), a]))
  const consumedMap = new Map(consumedRows.map((r) => [`${r.kind}:${r.medicationId}`, Number(r.totalDose) || 0]))
  const stockMap = new Map(stocks.map((s) => [`${s.locationId}:${s.itemId}`, s.quantity]))

  return entries.map(({ kind, row }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = row.toJSON() as any
    const resident = toResidentSummary(json.resident)

    const slots = selectedTimings(row)
      .filter((t) => isSlotVisible(json.resident, t.time, shifts))
      .map((t, index, all) => {
        const administration = administrationMap.get(slotKey(kind, row.id, t.timeOfDay))
        const done = administration?.status === MedicationAdministrationStatus.COMPLETED ? administration : null
        const cancelledAt = administration?.cancelledAt ?? null
        return {
          id: slotKey(kind, row.id, t.timeOfDay),
          kind,
          medicationId: row.id,
          timeOfDay: t.timeOfDay,
          time: t.time,
          dose: Number(t.dose) || 0,
          route: t.route,
          mealTiming: t.mealTiming,
          scheduledDate: targetDate,
          slotNumber: index + 1,
          totalSlots: all.length,
          status: administration?.status ?? 'PENDING',
          administrationId: administration?.id ?? null,
          completedAt: done?.completedAt ?? null,
          completedByName: done ? userName(done.completedByUser) : null,
          cancelledAt,
          cancelledByName: cancelledAt ? userName(administration?.cancelledByUser) : null,
        }
      })

    const item = json.inventoryItem as { packType?: string; packUnit?: string; packQuantity?: number } | null
    const stockQuantity = stockMap.get(`${row.locationId}:${row.inventoryItemId}`) ?? 0
    const totalDose = consumedMap.get(`${kind}:${row.id}`) ?? 0

    return {
      groupKey: `${kind}_${row.id}`,
      kind,
      medicationId: row.id,
      residentId: row.residentId,
      locationId: row.locationId,
      inventoryItemId: row.inventoryItemId,
      medicineName: row.medicineName,
      startDate: row.startDate,
      endDate: row.endDate || null,
      isUntilDischarge: Boolean(row.isUntilDischarge),
      note: row.note || null,
      resident,
      stock: {
        packType: item?.packType || null,
        packUnit: item?.packUnit || null,
        isWholePack: isWholePack(item?.packType),
        consumedDose: totalDose,
        consumedDisplay: consumedDisplay(totalDose, item),
        centerStockQuantity: stockQuantity,
        centerStockDisplay:
          item?.packType && item.packUnit && item.packQuantity
            ? stockDisplay(stockQuantity, item as { packType: string; packUnit: string; packQuantity: number })
            : String(stockQuantity),
      },
      totalSlots: slots.length,
      pendingSlots: slots.filter((s) => s.status === 'PENDING').length,
      slots,
    }
  })
}

/**
 * Today's medication / insulin doses for the nurse Tasks tab.
 */
export async function listMedicationTasks(params: {
  targetDate: string
  tab: 'PENDING' | 'COMPLETED' | 'ALL'
  search: string
  locationId: string | null
  scope: MedicationTaskScope
  nurseId: string | null
}) {
  const { targetDate, tab, locationId, scope, nurseId } = params
  const search = params.search.trim().toLowerCase()

  const entries = (await loadActiveMedications({ targetDate, locationId, scope })).filter(({ row }) => {
    if (!search) return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resident = toResidentSummary((row.toJSON() as any).resident)
    return `${residentName(resident)} ${row.medicineName}`.toLowerCase().includes(search)
  })
  const allGroups = (await buildMedicationGroups(entries, targetDate, scope.shifts)).filter((g) => g.totalSlots > 0)
  const pendingCount = allGroups.reduce((sum, g) => sum + g.pendingSlots, 0)
  const groups = tab === 'PENDING' ? allGroups.filter((g) => g.pendingSlots > 0) : allGroups

  const completedRowsWhere = completedWhere({ targetDate, locationId, scope, nurseId })
  const completedCount = await ResidentMedicationAdministration.count({ where: completedRowsWhere })

  let completed: ReturnType<typeof formatAdministrationRow>[] = []
  if (tab !== 'PENDING') {
    const rows = await ResidentMedicationAdministration.findAll({
      where: completedRowsWhere,
      include: [residentInclude, userInclude('completedByUser'), userInclude('cancelledByUser'), inventoryItemInclude],
      order: [['updatedAt', 'DESC']],
      limit: 200,
    })
    completed = rows
      .map(formatAdministrationRow)
      .filter((r) => !search || `${r.residentName} ${r.medicineName}`.toLowerCase().includes(search))
  }

  return {
    counts: { pending: pendingCount, completed: completedCount },
    data: tab === 'COMPLETED' ? completed : groups,
    ...(tab === 'ALL' ? { completed } : {}),
  }
}

/**
 * One medication / insulin with every dose scheduled on `targetDate`, for the nurse task detail screen.
 */
export async function getMedicationTaskDetail(params: {
  kind: MedicationKind
  medicationId: string
  targetDate: string
  scope: MedicationTaskScope
}) {
  const { kind, medicationId, targetDate, scope } = params
  const row = (await (modelFor(kind) as typeof ResidentMedication).findOne({
    where: { id: medicationId, isDeleted: false },
    include: [residentInclude, inventoryItemInclude],
  })) as MedicationRow | null
  if (!row) throw new HttpError(404, 'Medication not found')
  if (scope.residentIds && !scope.residentIds.includes(row.residentId)) {
    throw new HttpError(403, 'This resident is not assigned to your care team')
  }

  const scheduledOnDate = row.isActive !== false && isActiveOn(row, targetDate)
  const [group] = await buildMedicationGroups([{ kind, row }], targetDate, null)
  const administrations = await ResidentMedicationAdministration.findAll({
    where: { kind, medicationId, scheduledDate: targetDate, isDeleted: false },
    include: [userInclude('completedByUser'), userInclude('cancelledByUser'), inventoryItemInclude],
    order: [['createdAt', 'ASC']],
  })

  return {
    ...group!,
    ...(scheduledOnDate ? {} : { slots: [], totalSlots: 0, pendingSlots: 0 }),
    targetDate,
    scheduledOnDate,
    administrations: administrations.map(formatAdministrationRow),
  }
}

async function uploadFiles(files: Express.Multer.File[], folder: string, userId: string, fileType: ConsultantFileType) {
  const uploaded: ConsultantFileEntry[] = []
  for (const file of files) {
    const result = await uploadFileToS3(file, folder)
    uploaded.push({
      id: randomUUID(),
      url: result.location,
      key: result.key,
      name: file.originalname || result.key.split('/').pop() || 'file',
      contentType: result.contentType,
      size: result.size,
      fileType,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: userId,
    })
  }
  return uploaded
}

/**
 * Base units to issue for this dose. Fractional doses accumulate: we issue up to
 * floor(total doses given) minus what earlier doses already issued, which also
 * catches up doses that were recorded while stock was short.
 */
async function quantityToIssue(kind: MedicationKind, medicationId: string): Promise<number> {
  const [totals] = (await ResidentMedicationAdministration.findAll({
    where: { kind, medicationId, isDeleted: false, status: MedicationAdministrationStatus.COMPLETED },
    attributes: [
      [fn('SUM', col('dose')), 'totalDose'],
      [fn('SUM', col('deductedQuantity')), 'totalDeducted'],
    ],
    raw: true,
  })) as unknown as Array<{ totalDose: string | number | null; totalDeducted: string | number | null }>
  const totalDose = Number(totals?.totalDose) || 0
  const totalDeducted = Number(totals?.totalDeducted) || 0
  return Math.max(0, Math.floor(totalDose + 1e-9) - totalDeducted)
}

async function deductStock(
  administration: ResidentMedicationAdministration,
  item: { id: string; packType?: string } | null | undefined,
  userId: string,
): Promise<void> {
  if (!item || isWholePack(item.packType) || administration.dose <= 0) {
    administration.stockStatus = MedicationStockStatus.NOT_APPLICABLE
    return
  }

  const quantity = await quantityToIssue(administration.kind, administration.medicationId)
  if (quantity === 0) {
    administration.stockStatus = MedicationStockStatus.DEDUCTED
    return
  }

  try {
    const transaction = await assignItems(
      administration.locationId,
      {
        requestId: administration.id,
        residentId: administration.residentId,
        date: administration.scheduledDate,
        notes: `${administration.medicineName} administered (${administration.timeOfDay}, ${administration.scheduledDate})`,
        items: [{ itemId: item.id, quantity }],
      },
      userId,
    )
    administration.stockStatus = MedicationStockStatus.DEDUCTED
    administration.deductedQuantity = quantity
    administration.stockTransactionId = (transaction as { id?: string }).id ?? null
  } catch (err) {
    console.warn('Medication stock deduction skipped:', err instanceof Error ? err.message : err)
    administration.stockStatus = MedicationStockStatus.INSUFFICIENT
  }
}

/**
 * Records a medication / insulin dose as given and issues the stock from center inventory.
 * A stock shortage never blocks the dose; it is recorded with stockStatus INSUFFICIENT.
 */
export async function completeMedicationTask(params: {
  input: CompleteMedicationTaskInput
  userId: string
  today: string
  scope: MedicationTaskScope
  files: MedicationTaskFiles
}) {
  const { input, userId, files } = params
  const { row, timing, existing } = await resolveTaskSlot({ ...params, action: 'completed' })
  if (existing?.status === MedicationAdministrationStatus.COMPLETED) {
    throw new HttpError(409, 'This dose has already been completed')
  }

  const folder = `medication-administrations/${row.residentId}`
  const [attachments, voiceNotes] = await Promise.all([
    uploadFiles(files.photos, folder, userId, 'IMAGE'),
    uploadFiles(files.voiceNotes, folder, userId, 'AUDIO'),
  ])
  const completion = {
    status: MedicationAdministrationStatus.COMPLETED,
    completedBy: userId,
    completedAt: new Date(),
    notes: input.notes ?? null,
    attachments,
    voiceNotes,
    updatedBy: userId,
  }

  let administration: ResidentMedicationAdministration
  if (existing) {
    // A cancelled dose given later keeps its cancellation details.
    administration = await existing.update(completion)
  } else {
    try {
      administration = await ResidentMedicationAdministration.create({
        ...slotAttributes(row, input, timing),
        ...completion,
        createdBy: userId,
      })
    } catch (err) {
      if (err instanceof UniqueConstraintError) throw new HttpError(409, 'This dose has already been completed')
      throw err
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await deductStock(administration, (row.toJSON() as any).inventoryItem, userId)
  administration.updatedBy = userId
  await administration.save()

  return loadFormattedAdministration(administration)
}

/**
 * Marks a pending medication / insulin dose as cancelled (refused, unavailable, ...). No stock is issued.
 * The dose can still be completed afterwards.
 */
export async function cancelMedicationTask(params: {
  input: CancelMedicationTaskInput
  userId: string
  today: string
  scope: MedicationTaskScope
  files: MedicationTaskFiles
}) {
  const { input, userId, files } = params
  const { row, timing, existing } = await resolveTaskSlot({ ...params, action: 'cancelled' })
  if (existing) {
    throw new HttpError(
      409,
      existing.status === MedicationAdministrationStatus.CANCELLED
        ? 'This dose has already been cancelled'
        : 'This dose has already been completed',
    )
  }

  const folder = `medication-administrations/${row.residentId}/cancellations`
  const [cancelAttachments, cancelVoiceNotes] = await Promise.all([
    uploadFiles(files.photos, folder, userId, 'IMAGE'),
    uploadFiles(files.voiceNotes, folder, userId, 'AUDIO'),
  ])

  let administration: ResidentMedicationAdministration
  try {
    administration = await ResidentMedicationAdministration.create({
      ...slotAttributes(row, input, timing),
      status: MedicationAdministrationStatus.CANCELLED,
      cancelledBy: userId,
      cancelledAt: new Date(),
      cancelReason: input.notes ?? null,
      cancelAttachments,
      cancelVoiceNotes,
      stockStatus: MedicationStockStatus.NOT_APPLICABLE,
      createdBy: userId,
      updatedBy: userId,
    })
  } catch (err) {
    if (err instanceof UniqueConstraintError) throw new HttpError(409, 'This dose has already been updated')
    throw err
  }

  return loadFormattedAdministration(administration)
}

function slotAttributes(row: MedicationRow, input: CompleteMedicationTaskInput, timing: MedicationTiming) {
  return {
    residentId: row.residentId,
    locationId: row.locationId,
    kind: input.kind,
    medicationId: row.id,
    inventoryItemId: row.inventoryItemId,
    medicineName: row.medicineName,
    timeOfDay: input.timeOfDay,
    scheduledDate: input.scheduledDate,
    scheduledTime: timing.time,
    dose: Number(timing.dose) || 0,
    route: timing.route,
    mealTiming: timing.mealTiming,
  }
}

async function loadFormattedAdministration(administration: ResidentMedicationAdministration) {
  const saved = await ResidentMedicationAdministration.findByPk(administration.id, {
    include: [residentInclude, userInclude('completedByUser'), userInclude('cancelledByUser'), inventoryItemInclude],
  })
  return formatAdministrationRow(saved ?? administration)
}

/**
 * Shared checks before completing or cancelling a dose: files, care-team access and that the
 * dose time is scheduled for that date. Returns the existing administration row, if any.
 */
async function resolveTaskSlot(params: {
  input: CompleteMedicationTaskInput
  today: string
  scope: MedicationTaskScope
  files: MedicationTaskFiles
  action: 'completed' | 'cancelled'
}) {
  const { input, today, scope, files, action } = params

  if (input.scheduledDate > today) {
    throw new HttpError(400, `Future doses cannot be ${action} yet`)
  }
  if (files.photos.length > MAX_MEDICATION_TASK_PHOTOS) {
    throw new HttpError(400, `You can attach up to ${MAX_MEDICATION_TASK_PHOTOS} photos`)
  }
  if (files.voiceNotes.length > MAX_MEDICATION_TASK_VOICE_NOTES) {
    throw new HttpError(400, `You can attach up to ${MAX_MEDICATION_TASK_VOICE_NOTES} voice note`)
  }
  const badPhoto = files.photos.find((f) => !f.mimetype.startsWith('image/'))
  if (badPhoto) throw new HttpError(400, `"${badPhoto.originalname}" is not an image`)
  const badAudio = files.voiceNotes.find((f) => !f.mimetype.startsWith('audio/') && !f.mimetype.startsWith('video/'))
  if (badAudio) throw new HttpError(400, `"${badAudio.originalname}" is not a supported audio file`)

  const Model = modelFor(input.kind)
  const row = (await (Model as typeof ResidentMedication).findOne({
    where: { id: input.medicationId, isDeleted: false, isActive: true },
    include: [residentInclude, inventoryItemInclude],
  })) as MedicationRow | null
  if (!row) throw new HttpError(404, 'Medication not found')

  if (scope.residentIds && !scope.residentIds.includes(row.residentId)) {
    throw new HttpError(403, 'This resident is not assigned to your care team')
  }
  if (!isActiveOn(row, input.scheduledDate)) {
    throw new HttpError(400, 'This medication is not scheduled on the selected date')
  }
  const timing = selectedTimings(row).find((t) => t.timeOfDay === input.timeOfDay)
  if (!timing) throw new HttpError(400, 'This dose time is not scheduled for the medication')

  const existing = await ResidentMedicationAdministration.findOne({
    where: {
      kind: input.kind,
      medicationId: row.id,
      timeOfDay: input.timeOfDay,
      scheduledDate: input.scheduledDate,
      isDeleted: false,
    },
  })
  return { row, timing, existing }
}

/**
 * Administration history for a resident (admin Medication tab).
 */
export async function listMedicationAdministrations(residentId: string, query: ListMedicationAdministrationsQuery) {
  const rows = await ResidentMedicationAdministration.findAll({
    where: {
      residentId,
      isDeleted: false,
      ...(query.date ? { scheduledDate: query.date } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.medicationId ? { medicationId: query.medicationId } : {}),
    },
    include: [userInclude('completedByUser'), userInclude('cancelledByUser'), inventoryItemInclude],
    order: [
      ['scheduledDate', 'DESC'],
      ['updatedAt', 'DESC'],
    ],
    limit: query.limit ?? 200,
  })
  return rows.map(formatAdministrationRow)
}
