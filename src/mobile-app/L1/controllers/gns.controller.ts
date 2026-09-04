import { Request, Response } from 'express'
import { GatePreapproved, GateEntry, Resident, GuestMaster } from '../../../models/index.js'
import { Op } from 'sequelize'
import QRCode from 'qrcode'
import { uploadBase64ToS3 } from '../../../middlewares/s3/index.js'

export const createPreapproved = async (req: Request, res: Response) => {
  try {
    const {
      visitorName,
      visitorPhone,
      visitorType,
      startDate,
      startTime,
      locId,
      residentId,
      notes,
      company,
      personToMeet,
      scheduleType,
      endDate,
      endTime,
      visitorPhotos,
      vehicleNumber,
      additionalVisitors,
    } = req.body

    const activeResidentId = residentId || (req as Request & { user?: { id: string } }).user?.id

    let activeUnitId = req.body.unitId
    let finalLocId = locId

    if (activeResidentId) {
      const resident = await Resident.findByPk(activeResidentId)
      if (resident) {
        if (!activeUnitId && resident.unitId) {
          activeUnitId = resident.unitId
        }
        if (resident.locId && !finalLocId) {
          finalLocId = resident.locId
        }
      }
    }

    const visitorsToCreate = [
      { name: visitorName, phone: visitorPhone, visitorPhotos: visitorPhotos || [] },
      ...(additionalVisitors || []).map((v: Record<string, unknown>) => ({
        name: v.name,
        phone: v.phone,
        visitorPhotos: v.visitorPhotos || [],
      })),
    ]

    const createdPreapproved = await Promise.all(
      visitorsToCreate.map(async (v, _index) => {
        const finalPhotoUrls = await Promise.all(
          (v.visitorPhotos || []).map(async (p: string) => {
            if (p && p.startsWith('data:image')) {
              return await uploadBase64ToS3(p, 'gate/preapproved')
            }
            return p
          }),
        )

        const qrHash = Math.floor(100000 + Math.random() * 900000).toString()

        let qrCodeImage = await QRCode.toDataURL(qrHash, {
          width: 400,
          margin: 4,
          color: { dark: '#000000', light: '#ffffff' },
        })
        const uploadedQr = await uploadBase64ToS3(qrCodeImage, 'gate/qrcodes')
        if (uploadedQr) {
          qrCodeImage = uploadedQr
        }

        const preapproved = await GatePreapproved.create({
          visitorName: v.name,
          visitorPhone: v.phone,
          visitorType,
          startDate: startDate ? startDate : null,
          startTime: startTime ? startTime : null,
          unitId: activeUnitId,
          locId: finalLocId,
          residentId: activeResidentId,
          visitorPhotos: finalPhotoUrls.length > 0 ? finalPhotoUrls : null,
          vehicleNumber,
          notes,
          company,
          personToMeet,
          status: 'Pending',
          qrCode: qrHash,
          qrCodeImage: qrCodeImage,
          scheduleType: scheduleType || 'ONCE',
          endDate: endDate ? endDate : startDate ? startDate : null,
          endTime: endTime || null,
        })

        return { ...preapproved.toJSON(), qrCodeImage }
      }),
    )

    return res.status(201).json({ success: true, data: createdPreapproved })
  } catch (error) {
    console.error('Error creating preapproved:', error)
    return res
      .status(500)
      .json({
        success: false,
        message: 'Error creating preapproved',
        error: error instanceof Error ? error.message : error,
      })
  }
}

export const getPreapproved = async (req: Request, res: Response) => {
  try {
    const residentId = (req as Request & { user?: { id: string } }).user?.id
    const resident = await Resident.findByPk(residentId)
    const unitId = resident?.unitId

    const dateFilterVal = (req.query.date as string) || ''

    const preapprovedWhere: Record<string, unknown> = { residentId }
    const extraEntriesWhere: Record<string, unknown> = {
      status: { [Op.not]: 'PendingApproval' },
      ...(unitId && { unitId }),
    }

    if (dateFilterVal) {
      const startDate = new Date(dateFilterVal)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 1)

      const dateCondition = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      }
      preapprovedWhere.startDate = dateFilterVal
      extraEntriesWhere.createdAt = dateCondition
    }

    const preapproved = await GatePreapproved.findAll({
      where: preapprovedWhere,
      order: [['createdAt', 'DESC']],
    })

    const preapprovedIds = preapproved.map((i) => i.id)
    const preapprovedEntries =
      preapprovedIds.length > 0
        ? await GateEntry.findAll({
            where: { preapprovedId: preapprovedIds },
          })
        : []

    if (preapprovedIds.length > 0) {
      extraEntriesWhere.preapprovedId = {
        [Op.or]: [{ [Op.is]: null }, { [Op.notIn]: preapprovedIds }],
      }
    }

    // We don't need to generate QR Code on the fly for new preapproved, it's stored in DB!
    // But we should fallback for old preapproved that don't have it.
    const enhancedPreapproved = await Promise.all(
      preapproved.map(async (inv) => {
        const data = inv.toJSON() as unknown as Record<string, unknown> & {
          qrCodeImage?: string
          qrCode?: string
          entryStatus?: string
          clockedInAt?: Date | null
          clockedOutAt?: Date | null
          createdAt?: Date | string
        }
        if (!data.qrCodeImage && data.qrCode) {
          data.qrCodeImage = await QRCode.toDataURL(data.qrCode as string, { width: 400, margin: 4 })
        }
        const entry = preapprovedEntries.find((e) => e.preapprovedId === inv.id)
        if (entry) {
          data.entryStatus = entry.status
          data.clockedInAt = entry.clockedInAt
          data.clockedOutAt = entry.clockedOutAt
        }
        return data
      }),
    )

    const extraEntries = await GateEntry.findAll({
      where: extraEntriesWhere,
      order: [['createdAt', 'DESC']],
    })

    const mappedExtraEntries = extraEntries.map((w) => {
      const data = w.toJSON() as unknown as Record<string, unknown> & {
        id?: string
        visitorName?: string
        visitorType?: string
        status?: string
        clockedInAt?: Date | null
        clockedOutAt?: Date | null
        createdAt?: Date | string
        visitorPhotos?: string[]
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
        visitorPhotos: data.visitorPhotos,
        isWalkin: data.entrySource === 'Walkin',
        isLogOnly: true,
      }
    })

    const page = parseInt((req.query.page as string) || '1', 10)
    const limit = parseInt((req.query.limit as string) || '10', 10)
    const statusFilter = (req.query.status as string) || ''
    const typeFilter = (req.query.visitorType as string) || ''

    let combined = [...enhancedPreapproved, ...mappedExtraEntries].sort(
      (a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime(),
    )

    if (statusFilter) {
      combined = combined.filter((item: Record<string, unknown>) => {
        const itemStatus = item.entryStatus || item.status
        return itemStatus === statusFilter
      })
    }

    if (typeFilter) {
      combined = combined.filter((item: Record<string, unknown>) => item.visitorType === typeFilter)
    }

    const count = combined.length
    const offset = (page - 1) * limit
    const paginatedRows = combined.slice(offset, offset + limit)

    return res.status(200).json({
      success: true,
      data: {
        rows: paginatedRows,
        count,
        page,
        totalPages: Math.ceil(count / limit),
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching preapproved', error })
  }
}

export const getWalkins = async (req: Request, res: Response) => {
  try {
    const residentId = (req as Request & { user?: { id: string } }).user?.id
    const resident = await Resident.findByPk(residentId)
    const unitId = resident?.unitId

    const dateFilterVal = (req.query.date as string) || ''

    const whereClause: Record<string, unknown> = {
      status: 'PendingApproval',
      ...(unitId && { unitId }),
    }

    if (dateFilterVal) {
      const startDate = new Date(dateFilterVal)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 1)

      whereClause.createdAt = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      }
    }

    const walkins = await GateEntry.findAll({
      where: whereClause,
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

export const updatePreapproved = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const updateData = req.body

    const preapproved = await GatePreapproved.findByPk(id as string)
    if (!preapproved) {
      return res.status(404).json({ success: false, message: 'Preapproved invite not found' })
    }

    if (updateData.visitorPhotos) {
      const finalPhotoUrls = await Promise.all(
        updateData.visitorPhotos.map(async (p: string) => {
          if (p && p.startsWith('data:image')) {
            return await uploadBase64ToS3(p, 'gate/preapproved')
          }
          return p
        }),
      )
      updateData.visitorPhotos = finalPhotoUrls
    }

    await preapproved.update(updateData)

    return res.status(200).json({ success: true, data: preapproved })
  } catch (error) {
    console.error('Error updating preapproved:', error)
    return res.status(500).json({ success: false, message: 'Failed to update preapproved invite' })
  }
}

export const deletePreapproved = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const preapproved = await GatePreapproved.findByPk(id as string)
    if (!preapproved) {
      return res.status(404).json({ success: false, message: 'Preapproved invite not found' })
    }

    await preapproved.destroy()

    return res.status(200).json({ success: true, message: 'Preapproved invite deleted successfully' })
  } catch (error) {
    console.error('Error deleting preapproved:', error)
    return res.status(500).json({ success: false, message: 'Failed to delete preapproved invite' })
  }
}

export const getGuestMasterList = async (req: Request, res: Response) => {
  try {
    const residentId = (req as Request & { user?: { id: string } }).user?.id
    const resident = await Resident.findByPk(residentId)
    const unitId = resident?.unitId

    if (!unitId) {
      return res.status(400).json({ success: false, message: 'Resident does not have an assigned unit' })
    }

    const guests = await GuestMaster.findAll({
      where: { unitId },
      order: [['name', 'ASC']],
    })

    return res.status(200).json({ success: true, data: guests })
  } catch (error) {
    console.error('Error fetching guest master list:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch guest master list' })
  }
}

export const createGuestMaster = async (req: Request, res: Response) => {
  try {
    const residentId = (req as Request & { user?: { id: string } }).user?.id
    const resident = await Resident.findByPk(residentId)
    const unitId = resident?.unitId
    const locId = resident?.locId

    if (!unitId || !locId) {
      return res.status(400).json({ success: false, message: 'Resident location or unit missing' })
    }

    const { name, phone, notes } = req.body

    const guest = await GuestMaster.create({
      unitId,
      locId,
      name,
      phone,
      notes,
    })

    return res.status(201).json({ success: true, data: guest })
  } catch (error) {
    console.error('Error creating guest master:', error)
    return res.status(500).json({ success: false, message: 'Failed to create guest master' })
  }
}

export const updateGuestMaster = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, phone, notes } = req.body

    const guest = await GuestMaster.findByPk(id as string)
    if (!guest) {
      return res.status(404).json({ success: false, message: 'Guest not found' })
    }

    await guest.update({ name, phone, notes })

    return res.status(200).json({ success: true, data: guest })
  } catch (error) {
    console.error('Error updating guest master:', error)
    return res.status(500).json({ success: false, message: 'Failed to update guest master' })
  }
}

export const deleteGuestMaster = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const guest = await GuestMaster.findByPk(id as string)
    if (!guest) {
      return res.status(404).json({ success: false, message: 'Guest not found' })
    }

    await guest.destroy()

    return res.status(200).json({ success: true, message: 'Guest deleted successfully' })
  } catch (error) {
    console.error('Error deleting guest master:', error)
    return res.status(500).json({ success: false, message: 'Failed to delete guest master' })
  }
}
