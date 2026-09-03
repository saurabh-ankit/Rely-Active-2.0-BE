import { Transaction } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import { RosterOpdSlot, RosterOpdBooking, Resident } from '../../../models/index.js'

export interface BookOpdSlotPayload {
  opdSlotId: string
  residentId: string
  bookedByUserId: string
  notes?: string | undefined
}

export class OpdBookingService {
  public static async bookSlot(payload: BookOpdSlotPayload) {
    const transaction: Transaction = await sequelize.transaction()

    try {
      const resident = await Resident.findByPk(payload.residentId, { transaction })
      if (!resident) {
        await transaction.rollback()
        throw new Error('Resident not found.')
      }

      const slot = await RosterOpdSlot.findOne({
        where: { id: payload.opdSlotId, activeToken: 'ACTIVE', isDeleted: false },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!slot) {
        await transaction.rollback()
        throw new Error('OPD slot not found.')
      }

      if (slot.status === 'BLOCKED' || slot.status === 'CANCELLED') {
        await transaction.rollback()
        throw new Error('OPD slot is not available for booking.')
      }

      if (slot.bookedCount >= slot.maxCapacity) {
        await transaction.rollback()
        throw new Error('OPD slot is fully booked.')
      }

      const existingBooking = await RosterOpdBooking.findOne({
        where: {
          opdSlotId: payload.opdSlotId,
          residentId: payload.residentId,
          activeToken: 'ACTIVE',
          status: 'CONFIRMED',
          isDeleted: false,
        },
        transaction,
      })

      if (existingBooking) {
        await transaction.rollback()
        throw new Error('Resident already has an active booking in this slot.')
      }

      const booking = await RosterOpdBooking.create(
        {
          opdSlotId: payload.opdSlotId,
          residentId: payload.residentId,
          bookedByUserId: payload.bookedByUserId,
          notes: payload.notes || null,
          status: 'CONFIRMED',
          activeToken: 'ACTIVE',
          createdBy: payload.bookedByUserId,
          updatedBy: payload.bookedByUserId,
        },
        { transaction },
      )

      const newCount = slot.bookedCount + 1
      let newStatus: 'AVAILABLE' | 'PARTIALLY_BOOKED' | 'FULL' = 'PARTIALLY_BOOKED'
      if (newCount >= slot.maxCapacity) newStatus = 'FULL'
      else if (newCount === 0) newStatus = 'AVAILABLE'

      await slot.update(
        { bookedCount: newCount, status: newStatus, updatedBy: payload.bookedByUserId },
        { transaction },
      )

      await transaction.commit()
      return booking
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  }

  public static async cancelBooking(bookingId: string, cancelledReason: string, performedBy: string) {
    const transaction: Transaction = await sequelize.transaction()

    try {
      const booking = await RosterOpdBooking.findOne({
        where: { id: bookingId, activeToken: 'ACTIVE', isDeleted: false },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!booking) {
        await transaction.rollback()
        throw new Error('Booking not found.')
      }

      if (booking.status === 'CANCELLED') {
        await transaction.rollback()
        throw new Error('Booking is already cancelled.')
      }

      const slot = await RosterOpdSlot.findOne({
        where: { id: booking.opdSlotId, activeToken: 'ACTIVE', isDeleted: false },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!slot) {
        await transaction.rollback()
        throw new Error('Associated OPD slot not found.')
      }

      await booking.update(
        {
          status: 'CANCELLED',
          cancelledReason,
          activeToken: booking.id,
          updatedBy: performedBy,
        },
        { transaction },
      )

      const newCount = Math.max(0, slot.bookedCount - 1)
      let newStatus: 'AVAILABLE' | 'PARTIALLY_BOOKED' | 'FULL' = 'AVAILABLE'
      if (newCount >= slot.maxCapacity) newStatus = 'FULL'
      else if (newCount > 0) newStatus = 'PARTIALLY_BOOKED'

      await slot.update({ bookedCount: newCount, status: newStatus, updatedBy: performedBy }, { transaction })

      await transaction.commit()
      return booking
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  }
}
