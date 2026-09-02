import { Request, Response } from 'express'
import { GateInvite, GateEntry, Resident } from '../../../models/index.js'
import { Op } from 'sequelize'
import QRCode from 'qrcode'

export const createInvite = async (req: Request, res: Response) => {
  try {
    const {
      visitorName,
      visitorPhone,
      visitorType,
      expectedDate,
      expectedTime,
      locId,
      residentId,
      numberOfPeople,
      photo,
      vehicleNumber,
      notes,
      company,
      personToMeet,
    } = req.body

    const activeResidentId = residentId || (req as Request & { user?: { id: string } }).user?.id

    let activeUnitId = req.body.unitId
    if (!activeUnitId && activeResidentId) {
      const resident = await Resident.findByPk(activeResidentId)
      if (resident && resident.unitId) {
        activeUnitId = resident.unitId
      }
    }

    // Generate a shorter, 8-character hex string for the QR code so it has lower density and scans easily
    const shortHash = Math.random().toString(36).substring(2, 10).toUpperCase()
    const qrHash = `QR_${shortHash}`

    const qrCodeImage = await QRCode.toDataURL(qrHash)

    const invite = await GateInvite.create({
      visitorName,
      visitorPhone,
      visitorType,
      expectedDate,
      expectedTime,
      unitId: activeUnitId,
      locId,
      residentId: activeResidentId,
      numberOfPeople,
      photo,
      vehicleNumber,
      notes,
      company,
      personToMeet,
      status: 'Pending',
      qrCode: qrHash,
      qrCodeImage: qrCodeImage,
    })

    return res.status(201).json({ success: true, data: { ...invite.toJSON(), qrCodeImage } })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error creating invite', error })
  }
}

export const getInvites = async (req: Request, res: Response) => {
  try {
    const residentId = (req as Request & { user?: { id: string } }).user?.id
    const resident = await Resident.findByPk(residentId)
    const unitId = resident?.unitId

    const invites = await GateInvite.findAll({
      where: { residentId },
      order: [['createdAt', 'DESC']],
    })

    const inviteIds = invites.map((i) => i.id)
    const inviteEntries =
      inviteIds.length > 0
        ? await GateEntry.findAll({
            where: { inviteId: inviteIds },
          })
        : []

    // We don't need to generate QR Code on the fly for new invites, it's stored in DB!
    // But we should fallback for old invites that don't have it.
    const enhancedInvites = await Promise.all(
      invites.map(async (inv) => {
        const data = inv.toJSON() as unknown as Record<string, unknown> & {
          qrCodeImage?: string
          qrCode?: string
          entryStatus?: string
          clockedInAt?: Date | null
          clockedOutAt?: Date | null
          createdAt?: Date | string
        }
        if (!data.qrCodeImage && data.qrCode) {
          data.qrCodeImage = await QRCode.toDataURL(data.qrCode as string)
        }
        const entry = inviteEntries.find((e) => e.inviteId === inv.id)
        if (entry) {
          data.entryStatus = entry.status
          data.clockedInAt = entry.clockedInAt
          data.clockedOutAt = entry.clockedOutAt
        }
        return data
      }),
    )

    const walkins = await GateEntry.findAll({
      where: {
        entrySource: 'Walkin',
        status: { [Op.not]: 'PendingApproval' },
        ...(unitId && { unitId }),
      },
      order: [['createdAt', 'DESC']],
    })

    const mappedWalkins = walkins.map((w) => {
      const data = w.toJSON() as unknown as Record<string, unknown> & {
        id?: string
        visitorName?: string
        visitorType?: string
        status?: string
        clockedInAt?: Date | null
        clockedOutAt?: Date | null
        createdAt?: Date | string
      }
      return {
        id: data.id,
        visitorName: data.visitorName,
        visitorType: data.visitorType,
        status: data.status,
        entryStatus: data.status,
        clockedInAt: data.clockedInAt,
        clockedOutAt: data.clockedOutAt,
        createdAt: data.createdAt,
        isWalkin: true,
      }
    })

    const combined = [...enhancedInvites, ...mappedWalkins].sort(
      (a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime(),
    )

    return res.status(200).json({ success: true, data: combined })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching invites', error })
  }
}

export const getWalkins = async (req: Request, res: Response) => {
  try {
    const residentId = (req as Request & { user?: { id: string } }).user?.id
    const resident = await Resident.findByPk(residentId)
    const unitId = resident?.unitId

    const walkins = await GateEntry.findAll({
      where: {
        status: 'PendingApproval',
        ...(unitId && { unitId }),
      },
      order: [['createdAt', 'DESC']],
    })

    return res.status(200).json({ success: true, data: walkins })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching walkins', error })
  }
}

export const updateWalkinStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const entry = await GateEntry.findByPk(id as string)
    if (!entry) return res.status(404).json({ success: false, message: 'Walkin not found' })

    if (status === 'Approved') {
      await entry.update({
        status: 'Inside',
        clockedInAt: new Date(),
      })
    } else if (status === 'Rejected') {
      await entry.update({ status: 'Rejected' })
    }

    return res.status(200).json({ success: true, data: entry })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error updating walkin status', error })
  }
}
