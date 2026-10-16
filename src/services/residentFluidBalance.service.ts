import { randomUUID } from 'node:crypto'
import { Op } from 'sequelize'
import sequelize from '../config/db/index.js'
import { FluidBalanceCategory, FluidIntakeType, FluidUnit } from '../enums/fluidBalance.enum.js'
import { ResidentFluidBalance, type ResidentFluidBalanceCreationAttributes } from '../models/index.js'
import type { CreateResidentFluidBalanceInput } from '../validations/residentFluidBalance.validation.js'
import { getClinicalResident } from './residentClinical.service.js'
import { userInclude, userName } from './residentCondition.service.js'

const SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000

function toMl(quantity: number, unit: FluidUnit): number {
  return Math.round((unit === FluidUnit.L ? quantity * 1000 : quantity) * 100) / 100
}

function numOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatFluidBalanceRow(row: ResidentFluidBalance) {
  const data = row.toJSON ? row.toJSON() : row
  return {
    id: data.id,
    batchId: data.batchId,
    category: data.category,
    fluidType: data.fluidType ?? null,
    ivFluidType: data.ivFluidType ?? null,
    description: data.description ?? null,
    collectedBy: data.collectedBy ?? null,
    quantity: numOrNull(data.quantity),
    unit: data.unit ?? null,
    quantityMl: numOrNull(data.quantityMl),
    stoolType: data.stoolType ?? null,
    comfortLevel: data.comfortLevel ?? null,
    note: data.note ?? null,
    recordedAt: new Date(data.recordedAt).toISOString(),
    createdBy: data.createdBy ?? null,
  }
}

export async function createResidentFluidBalance(params: {
  residentId: string
  input: CreateResidentFluidBalanceInput
  userId: string | null
}) {
  const { residentId, input, userId } = params
  const resident = await getClinicalResident(residentId)
  const batchId = randomUUID()
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date()

  const base = {
    residentId,
    locationId: resident.locId,
    batchId,
    recordedAt,
    isDeleted: false,
    createdBy: userId,
    updatedBy: userId,
  }

  const rows: ResidentFluidBalanceCreationAttributes[] = [
    ...input.intakes.map((item) => ({
      ...base,
      category: FluidBalanceCategory.INTAKE,
      fluidType: item.type,
      ivFluidType: item.type === FluidIntakeType.IV_FLUIDS ? (item.ivFluidType ?? null) : null,
      description: item.type === FluidIntakeType.ORAL_NG ? (item.description ?? null) : null,
      quantity: item.quantity,
      unit: item.unit,
      quantityMl: toMl(item.quantity, item.unit),
    })),
    ...input.outputs.map((item) => ({
      ...base,
      category: FluidBalanceCategory.OUTPUT,
      fluidType: item.type,
      collectedBy: item.collectedBy ?? null,
      quantity: item.quantity,
      unit: item.unit,
      quantityMl: toMl(item.quantity, item.unit),
    })),
    ...(input.bowel
      ? [
          {
            ...base,
            category: FluidBalanceCategory.BOWEL,
            stoolType: input.bowel.stoolType,
            comfortLevel: input.bowel.comfortLevel,
            note: input.bowel.note ?? null,
          },
        ]
      : []),
  ]

  const created = await sequelize.transaction((transaction) => ResidentFluidBalance.bulkCreate(rows, { transaction }))
  return { batchId, entries: created.map(formatFluidBalanceRow) }
}

/** Every entry recorded on `date` (YYYY-MM-DD, server local day), newest first. */
export async function listResidentFluidBalanceByDate(residentId: string, date: string) {
  await getClinicalResident(residentId)
  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T23:59:59.999`)

  const rows = await ResidentFluidBalance.findAll({
    where: {
      residentId,
      isDeleted: false,
      recordedAt: { [Op.between]: [dayStart, dayEnd] },
    },
    include: [userInclude('creator')],
    order: [['recordedAt', 'DESC']],
  })

  return {
    date,
    entries: rows.map((row) => ({ ...formatFluidBalanceRow(row), recordedByName: userName(row.creator) })),
  }
}

/** Intake, output and net totals (ml) over the last 24 hours. */
export async function getResidentFluidBalanceSummary(residentId: string) {
  await getClinicalResident(residentId)
  const windowEnd = new Date()
  const windowStart = new Date(windowEnd.getTime() - SUMMARY_WINDOW_MS)

  const rows = await ResidentFluidBalance.findAll({
    where: {
      residentId,
      isDeleted: false,
      recordedAt: { [Op.between]: [windowStart, windowEnd] },
    },
    attributes: ['category', 'quantityMl', 'recordedAt'],
    order: [['recordedAt', 'DESC']],
  })

  let intakeMl = 0
  let outputMl = 0
  let bowelCount = 0
  for (const row of rows) {
    const ml = numOrNull(row.quantityMl) ?? 0
    if (row.category === FluidBalanceCategory.INTAKE) intakeMl += ml
    else if (row.category === FluidBalanceCategory.OUTPUT) outputMl += ml
    else if (row.category === FluidBalanceCategory.BOWEL) bowelCount += 1
  }

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    intakeMl: round(intakeMl),
    outputMl: round(outputMl),
    netMl: round(intakeMl - outputMl),
    bowelCount,
    lastRecordedAt: rows[0] ? new Date(rows[0].recordedAt).toISOString() : null,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  }
}
