import { Request, Response } from 'express'
import { GateEntry, GatePreapproved, PropertyUnit, PropertyFloor, PropertyBlock } from '../../../models/index.js'
import { Op } from 'sequelize'
import { uploadBase64ToS3 } from '../../../middlewares/s3/index.js'

export const createWalkin = async (req: Request, res: Response) => {
  try {
    const {
      visitorName,
      visitorPhone,
      visitorType,
      unitId,
      vehicleNumber,
      visitorPhotos,
      notes,
      company,
      personToMeet,
      additionalVisitors,
    } = req.body

    let resolvedLocId = req.body.locId
    if (unitId && !resolvedLocId) {
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

    const visitorsToCreate = [
      { name: visitorName, phone: visitorPhone, visitorPhotos: visitorPhotos || [] },
      ...(additionalVisitors || []).map((v: Record<string, unknown>) => ({
        name: v.name,
        phone: v.phone,
        visitorPhotos: v.visitorPhotos || [],
      })),
    ]

    const entries = await Promise.all(
      visitorsToCreate.map(async (v, _index) => {
        const finalPhotoUrls = await Promise.all(
          (v.visitorPhotos || []).map(async (p: string) => {
            if (p && p.startsWith('data:image')) {
              return await uploadBase64ToS3(p, 'gate/entries')
            }
            return p
          }),
        )

        return GateEntry.create({
          locId: resolvedLocId,
          unitId,
          entrySource: 'Walkin',
          visitorType,
          visitorName: v.name,
          visitorPhone: v.phone,
          status: 'PendingApproval', // L3 creates Walk-in -> Request Sent for Approval
          vehicleNumber,
          visitorPhotos: finalPhotoUrls.length > 0 ? finalPhotoUrls : null,
          notes,
          company,
          personToMeet,
        })
      }),
    )

    return res.status(201).json({ success: true, data: entries })
  } catch (error) {
    console.error('Error creating walkin:', error)
    return res
      .status(500)
      .json({
        success: false,
        message: 'Error creating walkin entry',
        error: error instanceof Error ? error.message : error,
      })
  }
}

export const scanQr = async (req: Request, res: Response) => {
  try {
    const { qrCode } = req.body
    const preapproved = await GatePreapproved.findOne({ where: { qrCode } })

    if (!preapproved) {
      return res.status(404).json({ success: false, message: 'Invalid or expired QR code' })
    }

    if (preapproved.status === 'Scanned') {
      return res.status(400).json({ success: false, message: 'QR Code already scanned' })
    }

    if (['Rejected', 'Expired', 'Cancelled'].includes(preapproved.status)) {
      return res.status(400).json({ success: false, message: `QR Code is ${preapproved.status}` })
    }

    if (preapproved.endDate) {
      const today = new Date(new Date().setHours(0, 0, 0, 0))
      const validUntilDate = new Date(preapproved.endDate)
      validUntilDate.setHours(0, 0, 0, 0)

      if (validUntilDate < today) {
        await preapproved.update({ status: 'Expired' })
        return res.status(400).json({ success: false, message: 'QR Code has expired' })
      }

      if (validUntilDate.getTime() === today.getTime() && preapproved.endTime) {
        const [hours = 0, minutes = 0] = preapproved.endTime.split(':').map(Number)
        const now = new Date()
        const currentHours = now.getHours()
        const currentMinutes = now.getMinutes()

        if (currentHours > hours || (currentHours === hours && currentMinutes > minutes)) {
          await preapproved.update({ status: 'Expired' })
          return res.status(400).json({ success: false, message: 'QR Code has expired (Time passed)' })
        }
      }
    }

    const activeEntry = await GateEntry.findOne({
      where: {
        preapprovedId: preapproved.id,
        status: 'Inside',
      },
    })

    if (activeEntry) {
      return res
        .status(400)
        .json({ success: false, message: 'Visitor is already inside. Please clock them out first.' })
    }

    return res.status(200).json({ success: true, data: preapproved })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error scanning QR', error })
  }
}

export const rejectScan = async (req: Request, res: Response) => {
  try {
    const { preapprovedId } = req.body
    if (!preapprovedId) return res.status(400).json({ success: false, message: 'Provide preapprovedId' })

    const preapproved = await GatePreapproved.findByPk(preapprovedId)
    if (!preapproved) return res.status(404).json({ success: false, message: 'Preapproved not found' })

    await preapproved.update({ status: 'Rejected' })

    const entry = await GateEntry.create({
      locId: preapproved.locId,
      unitId: preapproved.unitId,
      preapprovedId: preapproved.id,
      entrySource: 'Preapproved',
      visitorType: preapproved.visitorType,
      visitorName: preapproved.visitorName,
      visitorPhone: preapproved.visitorPhone,
      status: 'Rejected',
      clockedInBy: (req as Request & { user?: { id: string } }).user?.id || null,
      vehicleNumber: preapproved.vehicleNumber,
      visitorPhotos: preapproved.visitorPhotos,
      notes: preapproved.notes,
      company: preapproved.company,
      personToMeet: preapproved.personToMeet,
    })

    return res.status(200).json({ success: true, data: preapproved, entry })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error rejecting scan', error })
  }
}

export const clockIn = async (req: Request, res: Response) => {
  try {
    const { preapprovedId, entryId, vehicleNumber } = req.body

    let entry
    // If it's an preapproved scan flow:
    if (preapprovedId) {
      const preapproved = await GatePreapproved.findByPk(preapprovedId)
      if (!preapproved) return res.status(404).json({ success: false, message: 'Preapproved not found' })

      entry = await GateEntry.create({
        locId: preapproved.locId,
        unitId: preapproved.unitId,
        preapprovedId: preapproved.id,
        entrySource: 'Preapproved',
        visitorType: preapproved.visitorType,
        visitorName: preapproved.visitorName,
        visitorPhone: preapproved.visitorPhone,
        status: 'Inside',
        clockedInAt: new Date(),
        clockedInBy: (req as Request & { user?: { id: string } }).user?.id || null,
        vehicleNumber: vehicleNumber || preapproved.vehicleNumber,
        visitorPhotos: preapproved.visitorPhotos,
        notes: preapproved.notes,
        company: preapproved.company,
        personToMeet: preapproved.personToMeet,
      })

      await preapproved.update({ status: 'Scanned' })
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
      return res.status(400).json({ success: false, message: 'Provide either preapprovedId or entryId' })
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

export const getPendingPreapproved = async (req: Request, res: Response) => {
  try {
    const locId =
      (req.query.locId as string) ||
      (req as Request & { user?: { defaultLocationId?: string }; locationId?: string }).user?.defaultLocationId ||
      (req as Request & { user?: { defaultLocationId?: string }; locationId?: string }).locationId
    const date = req.query.date as string
    const visitorType = req.query.visitorType as string

    if (!locId) {
      return res.status(400).json({ success: false, message: 'Location ID required' })
    }

    const whereClause: Record<string, unknown> = {
      locId,
      status: 'Pending',
    }

    if (date) {
      whereClause.startDate = date
    }

    if (visitorType) {
      whereClause.visitorType = visitorType
    }

    const pageNum = parseInt((req.query.page as string) || '1', 10)
    const limitNum = parseInt((req.query.limit as string) || '20', 10)
    const offset = (pageNum - 1) * limitNum

    const { rows, count } = await GatePreapproved.findAndCountAll({
      where: whereClause,
      order: [
        ['startDate', 'ASC'],
        ['startTime', 'ASC'],
      ],
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          attributes: ['id', 'unit_number'],
        },
      ],
      limit: limitNum,
      offset,
    })

    return res.status(200).json({
      success: true,
      data: {
        rows,
        count,
        page: pageNum,
        totalPages: Math.ceil(count / limitNum),
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching pending preapproved', error })
  }
}

export const getEntriesByStatus = async (req: Request, res: Response) => {
  try {
    const locId =
      (req.query.locId as string) ||
      (req as Request & { user?: { defaultLocationId?: string }; locationId?: string }).user?.defaultLocationId ||
      (req as Request & { user?: { defaultLocationId?: string }; locationId?: string }).locationId
    const date = req.query.date as string
    const status = (req.query.status as string) || 'Inside'
    const visitorType = req.query.visitorType as string

    if (!locId) {
      return res.status(400).json({ success: false, message: 'Location ID required' })
    }

    const whereClause: Record<string, unknown> = { locId }

    if (visitorType) {
      whereClause.visitorType = visitorType
    }

    let preapprovedDateCondition: Record<string, unknown> = {}
    let entryDateCondition: Record<string, unknown> = {}

    if (date) {
      const startDateObj = new Date(date)
      startDateObj.setHours(0, 0, 0, 0)

      const endDateObj = new Date(startDateObj)
      endDateObj.setDate(endDateObj.getDate() + 1)

      entryDateCondition = {
        createdAt: {
          [Op.gte]: startDateObj,
          [Op.lt]: endDateObj,
        },
      }
      preapprovedDateCondition = {
        startDate: date,
      }
    }

    const pageNum = parseInt((req.query.page as string) || '1', 10)
    const limitNum = parseInt((req.query.limit as string) || '20', 10)

    if (status === 'Expired' || status === 'Pending') {
      const pWhere = { ...whereClause, status, ...preapprovedDateCondition }
      const offset = (pageNum - 1) * limitNum
      const { rows, count } = await GatePreapproved.findAndCountAll({
        where: pWhere,
        order: [['createdAt', 'DESC']],
        include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
        limit: limitNum,
        offset,
      })

      return res.status(200).json({
        success: true,
        data: {
          rows,
          count,
          page: pageNum,
          totalPages: Math.ceil(count / limitNum),
        },
      })
    }

    if (status !== 'All') {
      const eWhere = { ...whereClause, status, ...entryDateCondition }
      const offset = (pageNum - 1) * limitNum
      const { rows, count } = await GateEntry.findAndCountAll({
        where: eWhere,
        order: [['createdAt', 'DESC']],
        include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
        limit: limitNum,
        offset,
      })

      return res.status(200).json({
        success: true,
        data: {
          rows,
          count,
          page: pageNum,
          totalPages: Math.ceil(count / limitNum),
        },
      })
    }

    // If status is 'All', fetch both without limit, sort and paginate
    const entries = await GateEntry.findAll({
      where: { ...whereClause, ...entryDateCondition },
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
    })

    // We only fetch Pending Preapproved to avoid duplicates with Scanned ones which exist in GateEntry
    const preapproved = await GatePreapproved.findAll({
      where: { ...whereClause, status: 'Pending', ...preapprovedDateCondition },
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
    })

    const combined = [...entries, ...preapproved].sort((a, b) => {
      const aTime = new Date((a as unknown as Record<string, unknown>).createdAt as string).getTime()
      const bTime = new Date((b as unknown as Record<string, unknown>).createdAt as string).getTime()
      return bTime - aTime
    })

    const count = combined.length
    const offset = (pageNum - 1) * limitNum
    const paginatedRows = combined.slice(offset, offset + limitNum)

    return res.status(200).json({
      success: true,
      data: {
        rows: paginatedRows,
        count,
        page: pageNum,
        totalPages: Math.ceil(count / limitNum),
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching entries by status', error })
  }
}

export const getPropertyUnits = async (req: Request, res: Response) => {
  try {
    const locId =
      (req.query.locId as string) ||
      (req as Request & { user?: { defaultLocationId?: string }; locationId?: string }).user?.defaultLocationId ||
      (req as Request & { user?: { defaultLocationId?: string }; locationId?: string }).locationId
    if (!locId) {
      return res.status(400).json({ success: false, message: 'Location ID required' })
    }

    const blocks = await PropertyBlock.findAll({
      where: { propertyId: locId, isDeleted: false },
      order: [['block_name', 'ASC']],
      include: [
        {
          model: PropertyFloor,
          as: 'floors',
          where: { isDeleted: false },
          required: false,
          include: [
            {
              model: PropertyUnit,
              as: 'units',
              where: {
                isDeleted: false,
                occupancyStatus: { [Op.in]: ['OWNER_OCCUPIED', 'TENANT_OCCUPIED'] },
              },
              required: false,
            },
          ],
        },
      ],
    })

    return res.status(200).json({ success: true, data: blocks })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching property units', error })
  }
}
