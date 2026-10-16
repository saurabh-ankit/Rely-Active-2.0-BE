import type { Transaction } from 'sequelize'
import { UserDetail } from '../../models/index.js'

/** The doctor's current consultation fee, captured on each appointment when it is booked. */
export async function doctorConsultationFee(doctorId: string, transaction?: Transaction): Promise<number | null> {
  const detail = await UserDetail.findOne({
    where: { userId: doctorId },
    attributes: ['consultantFee'],
    transaction: transaction ?? null,
  })
  const fee = Number(detail?.consultantFee)
  return Number.isFinite(fee) && fee > 0 ? fee : null
}
