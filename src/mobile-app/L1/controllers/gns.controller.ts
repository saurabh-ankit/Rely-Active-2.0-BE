import { Request, Response } from 'express'
import { GatePreapproved, GateEntry, Resident, GuestMaster, PropertyUnit } from '../../../models/index.js'
import { Op } from 'sequelize'
import QRCode from 'qrcode'
import { uploadBase64ToS3 } from '../../../middlewares/s3/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { resolveHousehold } from '../../../utils/household.util.js'
import { approverFromRequest } from '../../../services/gateApproval.service.js'
import { publishGateDecisionSafe, type GateDecision } from '../../../services/notifications/gateNotification.service.js'

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

    const activeResidentId = residentId || resolveHousehold(req as AuthenticatedRequest)?.residentId

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
          // The resident or family member who made the pre-approval.
          createdBy: (req as AuthenticatedRequest).user?.id ?? null,
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
    return res.status(500).json({
      success: false,
      message: 'Error creating preapproved',
      error: error instanceof Error ? error.message : error,
    })
  }
}

export const getPreapproved = async (req: Request, res: Response) => {
  try {
    const residentId = resolveHousehold(req as AuthenticatedRequest)?.residentId
    const resident = residentId ? await Resident.findByPk(residentId) : null
    const unitId = resident?.unitId

    // Without a flat there is nothing to scope by, and an unscoped query would
    // return every unit's visitors — fail closed instead.
    if (!unitId) {
      return res.status(200).json({ success: true, data: [] })
    }

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
    const residentId = resolveHousehold(req as AuthenticatedRequest)?.residentId
    const resident = residentId ? await Resident.findByPk(residentId) : null
    const unitId = resident?.unitId

    // Same guard as getPreapproved: no flat, no list.
    if (!unitId) {
      return res.status(200).json({ success: true, data: [] })
    }

    const dateFilterVal = (req.query.date as string) || ''

    const whereClause: Record<string, unknown> = {
      status: 'PendingApproval',
      unitId,
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

/**
 * Approves or denies walk-ins the guard raised for the caller's flat. Only entries still waiting
 * are changed; the guard and the rest of the household are notified once.
 */
async function decideWalkins(req: Request, entryIds: string[], status: GateDecision) {
  const household = resolveHousehold(req as AuthenticatedRequest)
  const resident = household ? await Resident.findByPk(household.residentId, { attributes: ['id', 'unitId'] }) : null
  if (!resident?.unitId) return { code: 403, message: 'No flat is linked to this account.' } as const

  const entries = await GateEntry.findAll({ where: { id: entryIds, unitId: resident.unitId } })
  if (!entries.length) return { code: 404, message: 'Walk-in not found' } as const

  const pending = entries.filter((e) => e.status === 'PendingApproval')
  if (!pending.length) {
    const done = entries[0]!
    const outcome = done.status === 'Rejected' ? 'denied' : 'approved'
    return {
      code: 409,
      message: `Already ${outcome}${done.approverName ? ` by ${done.approverName}` : ''}.`,
      data: entries,
    } as const
  }

  // The resident (or family member) making the decision is the approver.
  const approver = await approverFromRequest(req)
  for (const entry of pending) {
    if (status === 'Approved') {
      // Approval lets the visitor straight in; the guard who raised the walk-in is at the gate with them.
      await entry.update({
        status: 'Inside',
        clockedInAt: new Date(),
        clockedInBy: entry.clockedInBy ?? entry.createdBy ?? null,
        ...approver,
      })
    } else {
      await entry.update({ status: 'Rejected', ...approver })
    }
  }

  void publishGateDecisionSafe(pending, status, {
    residentId: household?.residentId ?? null,
    familyMemberId: household?.familyMemberId ?? null,
    name: approver?.approverName ?? null,
  })
  return { code: 200, data: entries } as const
}

const isDecision = (status: unknown): status is GateDecision => status === 'Approved' || status === 'Rejected'

export const updateWalkinStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status } = req.body
    if (!isDecision(status)) {
      return res.status(400).json({ success: false, message: 'status must be Approved or Rejected' })
    }
    const result = await decideWalkins(req, [String(id)], status)
    if (result.code !== 200) {
      return res
        .status(result.code)
        .json({ success: false, message: result.message, data: 'data' in result ? result.data : undefined })
    }
    return res.status(200).json({ success: true, data: result.data[0] })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error updating walkin status', error })
  }
}

/**
 * PUT /gns/preapproved/walkins/decision  { entryIds: string[], status: 'Approved' | 'Rejected' }
 * One decision for every visitor the guard raised together (the approval popup / notification).
 */
export const decideWalkinRequest = async (req: Request, res: Response) => {
  try {
    const { entryIds, status } = req.body || {}
    const ids = Array.isArray(entryIds) ? entryIds.map(String).filter(Boolean) : []
    if (!ids.length || !isDecision(status)) {
      return res
        .status(400)
        .json({ success: false, message: 'entryIds and status (Approved or Rejected) are required' })
    }
    const result = await decideWalkins(req, ids, status)
    if (result.code !== 200) {
      return res
        .status(result.code)
        .json({ success: false, message: result.message, data: 'data' in result ? result.data : undefined })
    }
    return res.status(200).json({
      success: true,
      message: status === 'Approved' ? 'Visitor approved' : 'Visitor denied',
      data: result.data,
    })
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
    const residentId = resolveHousehold(req as AuthenticatedRequest)?.residentId
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
    const residentId = resolveHousehold(req as AuthenticatedRequest)?.residentId
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

export const getResidentEntries = async (req: Request, res: Response) => {
  try {
    const residentId = resolveHousehold(req as AuthenticatedRequest)?.residentId
    const resident = await Resident.findByPk(residentId)
    const unitId = resident?.unitId
    const locId = resident?.locId || (req.query.locId as string)

    const pageNum = parseInt((req.query.page as string) || '1', 10)
    const limitNum = parseInt((req.query.limit as string) || '10', 10)
    const offset = (pageNum - 1) * limitNum

    const status = (req.query.status as string) || ''
    const visitorType = (req.query.visitorType as string) || ''
    const date = (req.query.date as string) || ''

    const whereClause: Record<string, unknown> = {}

    if (unitId) {
      whereClause.unitId = unitId
    } else if (locId) {
      whereClause.locId = locId
    }

    if (status) {
      whereClause.status = status
    }

    if (visitorType) {
      whereClause.visitorType = visitorType
    }

    if (date) {
      const startDate = new Date(date)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 1)

      whereClause.createdAt = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      }
    }

    const { rows, count } = await GateEntry.findAndCountAll({
      where: whereClause,
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
    })

    const formattedRows = rows.map((e) => {
      const data = e.toJSON() as unknown as Record<string, unknown>
      return {
        ...data,
        isWalkin: data.entrySource === 'Walkin',
        checkInTime: data.clockedInAt,
        checkOutTime: data.clockedOutAt,
      }
    })

    return res.status(200).json({
      success: true,
      data: formattedRows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum) || 1,
      },
    })
  } catch (error) {
    console.error('Error fetching resident entries:', error)
    return res.status(500).json({ success: false, message: 'Error fetching entries', error })
  }
}
