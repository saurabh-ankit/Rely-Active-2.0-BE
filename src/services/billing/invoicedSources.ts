import { Op } from 'sequelize'
import { ServiceType, VOID_INVOICE_STATUSES } from '../../enums/billing.enum.js'
import { Invoice, ServicesInvoice } from '../../models/index.js'

/**
 * Which of these source records (lab reports, orders, …) are on an invoice that isn't cancelled.
 * Once invoiced a record is locked: editing it would make the invoice disagree with its source.
 */
export async function invoicedSourceIds(serviceType: ServiceType, sourceIds: string[]): Promise<Set<string>> {
  if (!sourceIds.length) return new Set()
  const rows = await ServicesInvoice.findAll({
    where: { serviceType, sourceId: [...new Set(sourceIds)], isDeleted: false },
    attributes: ['sourceId'],
    include: [
      {
        model: Invoice,
        as: 'invoice',
        attributes: [],
        required: true,
        where: { isDeleted: false, status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] } },
      },
    ],
  })
  return new Set(rows.map((r) => r.sourceId as string))
}
