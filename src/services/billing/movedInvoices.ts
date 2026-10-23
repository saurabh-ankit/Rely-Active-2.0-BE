import { Op, type Transaction } from 'sequelize'
import { InvoiceStatus, OPEN_INVOICE_STATUSES } from '../../enums/billing.enum.js'
import { Invoice, PropertyUnit, ResidentUnitMove } from '../../models/index.js'

/**
 * Invoices of a flat a resident moved out of go with them: the household moves together, so
 * whatever the old flat billed up to the move is owed on the new flat (carried into its next
 * invoice, or paid from its billing page). An invoice "went with" a move when it is on the
 * flat moved out of and started before the move — and after any earlier move out of that flat,
 * so a later household's invoices aren't mixed up with an earlier one's.
 */
export interface MoveWindow {
  residentId: string
  fromUnitId: string
  /** Invoices starting on or after this day (the previous move out of the flat), if any. */
  after: string | null
  /** …and before the move day. */
  before: string
}

type MoveRow = Pick<ResidentUnitMove, 'residentId' | 'fromUnitId' | 'moveDate'>

export const moveWindows = (moves: MoveRow[]): MoveWindow[] =>
  moves.map((m) => {
    const before = String(m.moveDate)
    const earlier = moves
      .filter((o) => o.fromUnitId === m.fromUnitId && String(o.moveDate) < before)
      .map((o) => String(o.moveDate))
      .sort()
      .at(-1)
    return { residentId: m.residentId, fromUnitId: m.fromUnitId, after: earlier ?? null, before }
  })

export const inWindow = (inv: Pick<Invoice, 'unitId' | 'startDate'>, w: MoveWindow) => {
  const start = String(inv.startDate)
  return inv.unitId === w.fromUnitId && start < w.before && (!w.after || start >= w.after)
}

/** Every move out of these flats and every move by these residents (enough to build all windows). */
export async function loadMoves(
  where: { unitIds?: string[]; residentIds?: string[] },
  transaction?: Transaction,
): Promise<ResidentUnitMove[]> {
  const or = [
    ...(where.unitIds?.length ? [{ fromUnitId: where.unitIds }] : []),
    ...(where.residentIds?.length ? [{ residentId: where.residentIds }] : []),
  ]
  if (!or.length) return []
  const direct = await ResidentUnitMove.findAll({
    where: { isDeleted: false, [Op.or]: or },
    transaction: transaction ?? null,
  })
  // Earlier moves out of the same old flats bound each window, so load those too.
  const fromUnitIds = [...new Set(direct.map((m) => m.fromUnitId))]
  if (!fromUnitIds.length) return direct
  const known = new Set(direct.map((m) => m.id))
  const others = await ResidentUnitMove.findAll({
    where: { isDeleted: false, fromUnitId: fromUnitIds, id: { [Op.notIn]: [...known] } },
    transaction: transaction ?? null,
  })
  return [...direct, ...others]
}

const openWhere = { isDeleted: false, status: { [Op.in]: [...OPEN_INVOICE_STATUSES] } }

/**
 * Invoices from flats these residents lived in before `unitId`. `openOnly` keeps those still
 * owing money (not yet carried into a newer invoice), oldest first.
 */
export async function previousFlatInvoices(
  residentIds: string[],
  unitId: string,
  opts: { openOnly?: boolean; transaction?: Transaction | undefined; lock?: boolean } = {},
): Promise<Invoice[]> {
  if (!residentIds.length) return []
  const windows = moveWindows(await loadMoves({ residentIds }, opts.transaction)).filter(
    (w) => residentIds.includes(w.residentId) && w.fromUnitId !== unitId,
  )
  if (!windows.length) return []
  const candidates = await Invoice.findAll({
    where: {
      unitId: [...new Set(windows.map((w) => w.fromUnitId))],
      ...(opts.openOnly ? openWhere : { isDeleted: false, status: { [Op.ne]: InvoiceStatus.DRAFT } }),
    },
    include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
    order: [['startDate', 'ASC']],
    transaction: opts.transaction ?? null,
    ...(opts.lock && opts.transaction ? { lock: opts.transaction.LOCK.UPDATE } : {}),
  })
  return candidates.filter(
    (inv) => windows.some((w) => inWindow(inv, w)) && (!opts.openOnly || Number(inv.remainingBalance) > 0),
  )
}

/** Ids of this flat's invoices that went with a resident who moved out (not this flat's to collect). */
export async function movedAwayInvoiceIds(unitId: string, transaction?: Transaction): Promise<Set<string>> {
  const windows = moveWindows(await loadMoves({ unitIds: [unitId] }, transaction)).filter(
    (w) => w.fromUnitId === unitId,
  )
  if (!windows.length) return new Set()
  const invoices = await Invoice.findAll({
    where: { unitId, isDeleted: false },
    attributes: ['id', 'unitId', 'startDate'],
    transaction: transaction ?? null,
  })
  return new Set(invoices.filter((inv) => windows.some((w) => inWindow(inv, w))).map((inv) => inv.id))
}
