import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../../../middlewares/s3/index.js'
import { LabTestSetting, Resident, ResidentLabReport } from '../../../models/index.js'
import {
  formatLabReport,
  labReportInclude,
  listResidentLabReportsForResident,
} from '../../../services/residentClinical.service.js'
import type { CreateResidentLabReportInput } from '../../../validations/residentLabReport.validation.js'
import { assertDoctorClinicalAccess } from './doctorClinical.controller.js'

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({
    success: false,
    message: err instanceof Error ? err.message : 'Unknown error',
  })
}

function getUploadFiles(req: AuthenticatedRequest) {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
  const reportFile = files?.report?.[0]
  const receiptFile = files?.receipt?.[0]
  return { reportFile, receiptFile }
}

/**
 * GET /doctor/lab-test-settings
 * Active lab test settings for the upload dropdown.
 */
export async function listLabTestSettingsForDoctor(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const rows = await LabTestSetting.findAll({
      where: { isDeleted: false, isActive: true },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'description', 'instructions', 'imageUrl'],
    })

    const settings = rows
      .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        instructions: r.instructions,
        imageUrl: r.imageUrl,
      }))

    res.status(200).json({
      success: true,
      message: 'Lab test settings fetched successfully',
      data: settings,
    })
  } catch (err) {
    sendError(res, err, 'listLabTestSettingsForDoctor')
  }
}

/**
 * GET /doctor/residents/:residentId/lab-reports
 */
export async function listResidentLabReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const reports = await listResidentLabReportsForResident(residentId)

    res.status(200).json({
      success: true,
      message: 'Lab reports fetched successfully',
      data: reports,
    })
  } catch (err) {
    sendError(res, err, 'listResidentLabReports')
  }
}

/**
 * POST /doctor/residents/:residentId/lab-reports
 * Multipart: report (required), receipt (required when isPaid)
 */
export async function createResidentLabReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const resident = await Resident.findOne({
      where: { id: residentId, isDeleted: false },
      attributes: ['id', 'locId'],
    })
    if (!resident) {
      throw new HttpError(404, 'Resident not found')
    }

    const input = req.body as CreateResidentLabReportInput
    const { reportFile, receiptFile } = getUploadFiles(req)

    if (!reportFile) {
      throw new HttpError(400, 'Lab report file is required')
    }

    const isPaid = !!input.isPaid
    if (isPaid && !receiptFile) {
      throw new HttpError(400, 'Receipt file is required when already paid')
    }

    const setting = await LabTestSetting.findOne({
      where: { id: input.labTestSettingId, isDeleted: false, isActive: true },
    })
    if (!setting) {
      throw new HttpError(400, 'Lab test setting not found or inactive')
    }

    const locationId = input.locationId?.trim() || resident.locId
    if (!locationId) {
      throw new HttpError(400, 'Location ID is required')
    }

    const createdBy = req.user?.id ?? null

    const [reportUpload, receiptUpload] = await Promise.all([
      uploadFileToS3(reportFile, 'resident-lab-reports/reports'),
      isPaid && receiptFile ? uploadFileToS3(receiptFile, 'resident-lab-reports/receipts') : Promise.resolve(null),
    ])

    const report = await ResidentLabReport.create({
      residentId,
      locationId,
      appointmentId: input.appointmentId || null,
      labTestSettingId: input.labTestSettingId,
      severity: input.severity,
      reportDate: input.reportDate.trim(),
      notes: input.notes?.trim() || null,
      cost: input.cost ?? null,
      paymentMethod: isPaid ? (input.paymentMethod ?? null) : null,
      reportFileUrl: reportUpload.location,
      receiptFileUrl: isPaid ? (receiptUpload?.location ?? null) : null,
      isPaid,
      isActive: true,
      isDeleted: false,
      createdBy,
      updatedBy: createdBy,
    })

    await report.reload({ include: labReportInclude })

    res.status(201).json({
      success: true,
      message: 'Lab report uploaded successfully',
      data: formatLabReport(report),
    })
  } catch (err) {
    sendError(res, err, 'createResidentLabReport')
  }
}
