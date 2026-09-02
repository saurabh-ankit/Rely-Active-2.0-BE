import { Request, Response } from 'express'
import { GateEntry, GateInvite, PropertyUnit, PropertyFloor, PropertyBlock } from '../../../models/index.js'

export const createWalkin = async (req: Request, res: Response) => {
  try {
    const {
      visitorName,
      visitorPhone,
      visitorType,
      unitId,
      vehicleNumber,
      additionalDetails,
      numberOfPeople,
      photo,
      notes,
      company,
      personToMeet,
    } = req.body

    let resolvedLocId = req.body.locId
    if (unitId && (!resolvedLocId || resolvedLocId === '00000000-0000-0000-0000-000000000000')) {
      const unit = await PropertyUnit.findByPk(unitId, {
        include: [
          {
            model: PropertyFloor,
            as: 'floor',
            include: [{ model: PropertyBlock, as: 'block' }],
          },
        ],
      })

      interface UnitWithRelations {
        floor?: {
          block?: {
            locId?: string
          }
        }
      }

      const u = unit as unknown as UnitWithRelations
      if (u && u.floor && u.floor.block && u.floor.block.locId) {
        resolvedLocId = u.floor.block.locId
      }
    }

    const entry = await GateEntry.create({
      locId: resolvedLocId,
      unitId,
      entrySource: 'Walkin',
      visitorType,
      visitorName,
      visitorPhone,
      status: 'PendingApproval', // L3 creates Walk-in -> Request Sent for Approval
      vehicleNumber,
      additionalDetails,
      numberOfPeople,
      photo,
      notes,
      company,
      personToMeet,
    })

    return res.status(201).json({ success: true, data: entry })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error creating walkin request', error })
  }
}

export const scanQr = async (req: Request, res: Response) => {
  try {
    const { qrCode } = req.body
    const invite = await GateInvite.findOne({ where: { qrCode } })

    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invalid or expired QR code' })
    }

    if (invite.status === 'Scanned') {
      return res.status(400).json({ success: false, message: 'QR Code already scanned' })
    }

    // Automatically clock in
    const entry = await GateEntry.create({
      locId: invite.locId,
      unitId: invite.unitId,
      inviteId: invite.id,
      entrySource: 'Invite',
      visitorType: invite.visitorType,
      visitorName: invite.visitorName,
      visitorPhone: invite.visitorPhone,
      status: 'Inside',
      clockedInAt: new Date(),
      clockedInBy: (req as Request & { user?: { id: string } }).user?.id || null,
      vehicleNumber: invite.vehicleNumber,
      numberOfPeople: invite.numberOfPeople,
      photo: invite.photo,
      notes: invite.notes,
      company: invite.company,
      personToMeet: invite.personToMeet,
    })

    await invite.update({ status: 'Scanned' })

    return res.status(200).json({ success: true, data: invite, entry })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error scanning QR', error })
  }
}

export const clockIn = async (req: Request, res: Response) => {
  try {
    const { inviteId, entryId, vehicleNumber } = req.body

    let entry
    // If it's an invite scan flow:
    if (inviteId) {
      const invite = await GateInvite.findByPk(inviteId)
      if (!invite) return res.status(404).json({ success: false, message: 'Invite not found' })

      entry = await GateEntry.create({
        locId: invite.locId,
        unitId: invite.unitId,
        inviteId: invite.id,
        entrySource: 'Invite',
        visitorType: invite.visitorType,
        visitorName: invite.visitorName,
        visitorPhone: invite.visitorPhone,
        status: 'Inside',
        clockedInAt: new Date(),
        clockedInBy: (req as Request & { user?: { id: string } }).user?.id || null,
        vehicleNumber: vehicleNumber || invite.vehicleNumber,
        numberOfPeople: invite.numberOfPeople,
        photo: invite.photo,
        notes: invite.notes,
        company: invite.company,
        personToMeet: invite.personToMeet,
      })

      await invite.update({ status: 'Scanned' })
    }
    // If it's a walkin approval flow:
    else if (entryId) {
      entry = await GateEntry.findByPk(entryId)
      if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })

      await entry.update({
        status: 'Inside',
        clockedInAt: new Date(),
        clockedInBy: (req as Request & { user?: { id: string } }).user?.id || null,
        vehicleNumber,
      })
    } else {
      return res.status(400).json({ success: false, message: 'Provide either inviteId or entryId' })
    }

    return res.status(200).json({ success: true, data: entry })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error clocking in', error })
  }
}

export const clockOut = async (req: Request, res: Response) => {
  try {
    const { entryId } = req.body
    const entry = await GateEntry.findByPk(entryId)

    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })

    await entry.update({
      status: 'Completed',
      clockedOutAt: new Date(),
      clockedOutBy: (req as Request & { user?: { id: string } }).user?.id || null,
    })

    return res.status(200).json({ success: true, data: entry })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error clocking out', error })
  }
}
