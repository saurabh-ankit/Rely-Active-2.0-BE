import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../../../middlewares/s3/index.js'
import { LabTestSetting, Resident, ResidentLabReport } from '../../../models/index.js'
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

function numOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatLabReport(report: ResidentLabReport): Record<string, unknown> {
  const setting = report.labTestSetting
  return {
    id: report.id,
    residentId: report.residentId,
    locationId: report.locationId,
    appointmentId: report.appointmentId,
    labTestSettingId: report.labTestSettingId,
    labTestName: setting?.name ?? null,
    labTestImageUrl: setting?.imageUrl ?? null,
    severity: report.severity,
    reportDate: report.reportDate,
    notes: report.notes,
    cost: numOrNull(report.cost),
    paymentMethod: report.paymentMethod,
    reportFileUrl: report.reportFileUrl,
    receiptFileUrl: report.receiptFileUrl,
    isActive: report.isActive,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  }
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

    const rows = await ResidentLabReport.findAll({
      where: { residentId, isDeleted: false },
      include: [
        {
          model: LabTestSetting,
          as: 'labTestSetting',
          attributes: ['id', 'name', 'imageUrl', 'description'],
          required: false,
        },
      ],
      order: [
        ['reportDate', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Lab reports fetched successfully',
      data: rows.map(formatLabReport),
    })
  } catch (err) {
    sendError(res, err, 'listResidentLabReports')
  }
}

/**
 * POST /doctor/residents/:residentId/lab-reports
 * Multipart: report (required), receipt (optional)
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
      receiptFile ? uploadFileToS3(receiptFile, 'resident-lab-reports/receipts') : Promise.resolve(null),
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
      paymentMethod: input.paymentMethod ?? null,
      reportFileUrl: reportUpload.location,
      receiptFileUrl: receiptUpload?.location ?? null,
      isActive: true,
      isDeleted: false,
      createdBy,
      updatedBy: createdBy,
    })

    await report.reload({
      include: [
        {
          model: LabTestSetting,
          as: 'labTestSetting',
          attributes: ['id', 'name', 'imageUrl', 'description'],
          required: false,
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Lab report uploaded successfully',
      data: formatLabReport(report),
    })
  } catch (err) {
    sendError(res, err, 'createResidentLabReport')
  }
}
