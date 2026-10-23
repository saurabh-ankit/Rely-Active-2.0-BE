import { HttpError } from '../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../middlewares/s3/index.js'
import { LabTestSetting, ResidentLabReport } from '../models/index.js'
import type {
  CreateResidentLabReportInput,
  UpdateResidentLabReportInput,
} from '../validations/residentLabReport.validation.js'
import { formatLabReport, getClinicalResident, labReportInclude } from './residentClinical.service.js'

const REPORT_FOLDER = 'resident-lab-reports/reports'
const RECEIPT_FOLDER = 'resident-lab-reports/receipts'

export interface LabReportFiles {
  reportFile?: Express.Multer.File
  receiptFile?: Express.Multer.File
}

async function assertActiveLabTest(labTestSettingId: string): Promise<void> {
  const setting = await LabTestSetting.findOne({
    where: { id: labTestSettingId, isDeleted: false, isActive: true },
    attributes: ['id'],
  })
  if (!setting) {
    throw new HttpError(400, 'Lab test setting not found or inactive')
  }
}

async function findResidentLabReport(residentId: string, id: string): Promise<ResidentLabReport> {
  const row = await ResidentLabReport.findOne({ where: { id, residentId, isDeleted: false } })
  if (!row) {
    throw new HttpError(404, 'Lab report not found')
  }
  return row
}

export async function createResidentLabReport(params: {
  residentId: string
  input: CreateResidentLabReportInput
  files: LabReportFiles
  userId: string | null
}) {
  const { residentId, input, files, userId } = params
  if (!files.reportFile) {
    throw new HttpError(400, 'Lab report file is required')
  }

  const isPaid = !!input.isPaid
  if (isPaid && !files.receiptFile) {
    throw new HttpError(400, 'Receipt file is required when already paid')
  }

  const resident = await getClinicalResident(residentId)
  await assertActiveLabTest(input.labTestSettingId)

  const [reportUpload, receiptUpload] = await Promise.all([
    uploadFileToS3(files.reportFile, REPORT_FOLDER),
    isPaid && files.receiptFile ? uploadFileToS3(files.receiptFile, RECEIPT_FOLDER) : Promise.resolve(null),
  ])

  const report = await ResidentLabReport.create({
    residentId,
    locationId: input.locationId?.trim() || resident.locId,
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
    createdBy: userId,
    updatedBy: userId,
  })

  await report.reload({ include: labReportInclude })
  return formatLabReport(report)
}

/**
 * Files are only replaced when a new one is uploaded; `removeReceipt` clears the receipt.
 * Turning `isPaid` off clears payment method and receipt.
 */
export async function updateResidentLabReport(params: {
  residentId: string
  id: string
  input: UpdateResidentLabReportInput
  files: LabReportFiles
  userId: string | null
}) {
  const { residentId, id, input, files, userId } = params
  const report = await findResidentLabReport(residentId, id)

  if (input.labTestSettingId && input.labTestSettingId !== report.labTestSettingId) {
    await assertActiveLabTest(input.labTestSettingId)
  }

  const isPaid = input.isPaid !== undefined ? !!input.isPaid : report.isPaid

  const [reportUpload, receiptUpload] = await Promise.all([
    files.reportFile ? uploadFileToS3(files.reportFile, REPORT_FOLDER) : Promise.resolve(null),
    isPaid && files.receiptFile ? uploadFileToS3(files.receiptFile, RECEIPT_FOLDER) : Promise.resolve(null),
  ])

  let receiptFileUrl = report.receiptFileUrl
  let paymentMethod = report.paymentMethod

  if (!isPaid) {
    receiptFileUrl = null
    paymentMethod = null
  } else {
    if (receiptUpload) receiptFileUrl = receiptUpload.location
    else if (input.removeReceipt) receiptFileUrl = null
    if (input.paymentMethod !== undefined) paymentMethod = input.paymentMethod
    if (!receiptFileUrl) {
      throw new HttpError(400, 'Receipt file is required when already paid')
    }
    if (!paymentMethod) {
      throw new HttpError(400, 'Payment method is required when already paid')
    }
  }

  await report.update({
    labTestSettingId: input.labTestSettingId ?? report.labTestSettingId,
    severity: input.severity ?? report.severity,
    reportDate: input.reportDate !== undefined ? input.reportDate.trim() : report.reportDate,
    notes: input.notes !== undefined ? input.notes?.trim() || null : report.notes,
    cost: input.cost !== undefined ? input.cost : report.cost,
    paymentMethod,
    reportFileUrl: reportUpload?.location ?? report.reportFileUrl,
    receiptFileUrl,
    isPaid,
    updatedBy: userId,
  })

  await report.reload({ include: labReportInclude })
  return formatLabReport(report)
}

export async function deleteResidentLabReport(params: { residentId: string; id: string; userId: string | null }) {
  const { residentId, id, userId } = params
  const report = await findResidentLabReport(residentId, id)
  await report.update({ isDeleted: true, isActive: false, updatedBy: userId })
}
