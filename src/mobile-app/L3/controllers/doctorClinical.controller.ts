import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import {
  DoctorAppointment,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
} from '../../../models/index.js'
import { getResidentClinicalChart } from '../../../services/residentClinical.service.js'
import { deleteResidentAllergy, updateResidentAllergy } from '../../../services/residentAllergy.service.js'
import { deleteResidentVital, updateResidentVital } from '../../../services/residentVital.service.js'
import { deleteResidentMedication, updateResidentMedication } from '../../../services/residentMedication.service.js'
import { deleteResidentInsulin, updateResidentInsulin } from '../../../services/residentInsulin.service.js'
import type { UpdateResidentAllergyInput } from '../../../validations/residentAllergy.validation.js'
import type { UpdateResidentVitalInput } from '../../../validations/residentVital.validation.js'
import type { UpdateResidentMedicationInput } from '../../../validations/residentMedication.validation.js'
import { getStaffCareTeamResidentIds, isAdminOrSuperAdmin } from './medical.controller.js'

function formatResidentProfile(resident: Resident) {
  const unit = resident.unit as
    | (PropertyUnit & {
        floor?: (PropertyFloor & { block?: PropertyBlock | null }) | null
      })
    | null
    | undefined

  return {
    id: resident.id,
    firstName: resident.firstName,
    lastName: resident.lastName || '',
    fullName: `${resident.firstName} ${resident.lastName || ''}`.trim(),
    gender: resident.gender || null,
    dob: resident.dob || null,
    phone: resident.phone || null,
    email: resident.email || null,
    emergencyContact: resident.emergencyContact || null,
    bloodGroup: resident.bloodGroup || null,
    photoUrl: resident.photoUrl || null,
    locId: resident.locId,
    property: resident.property
      ? {
          id: resident.property.id,
          name: resident.property.property_name,
          city: resident.property.city,
        }
      : null,
    unit: unit
      ? {
          id: unit.id,
          unitNumber: unit.unit_number,
          unitType: unit.unit_type,
          floorNumber: unit.floor?.floor_number ?? null,
          floorName: unit.floor?.floor_name ?? null,
          blockName: unit.floor?.block?.block_name ?? null,
        }
      : null,
  }
}

async function loadResidentWithUnit(residentId: string): Promise<Resident | null> {
  return Resident.findOne({
    where: { id: residentId, isDeleted: false },
    include: [
      {
        model: Property,
        as: 'property',
        attributes: ['id', 'property_name', 'city'],
        required: false,
      },
      {
        model: PropertyUnit,
        as: 'unit',
        attributes: ['id', 'unit_number', 'unit_type', 'floorId'],
        include: [
          {
            model: PropertyFloor,
            as: 'floor',
            attributes: ['id', 'floor_number', 'floor_name', 'blockId', 'is_virtual'],
            include: [
              {
                model: PropertyBlock,
                as: 'block',
                attributes: ['id', 'block_name'],
                required: false,
              },
            ],
            required: false,
          },
        ],
        required: false,
      },
    ],
  })
}

/**
 * Allow access if admin, on care team, or has a doctor appointment for this resident.
 */
export async function assertDoctorClinicalAccess(
  req: AuthenticatedRequest,
  residentId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const doctorId = req.user?.id
  if (!doctorId) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }

  if (await isAdminOrSuperAdmin(req)) {
    return { ok: true }
  }

  const careTeamIds = await getStaffCareTeamResidentIds(doctorId)
  if (careTeamIds.includes(String(residentId))) {
    return { ok: true }
  }

  const booking = await DoctorAppointment.findOne({
    where: {
      doctorId,
      residentId,
      isDeleted: false,
    },
    attributes: ['id'],
  })
  if (booking) {
    return { ok: true }
  }

  return {
    ok: false,
    status: 403,
    message: 'You do not have access to this resident clinical chart',
  }
}

/**
 * GET /doctor/residents/:residentId/clinical
 * Aggregates allergies / vitals / medications / insulin / notes from dedicated tables + consultants.
 */
export async function getResidentClinical(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      res.status(400).json({ success: false, message: 'Resident ID is required' })
      return
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const resident = await loadResidentWithUnit(residentId)
    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    const chart = await getResidentClinicalChart(residentId)

    res.status(200).json({
      success: true,
      message: 'Resident clinical chart fetched successfully',
      data: {
        profile: formatResidentProfile(resident),
        ...chart,
      },
    })
  } catch (err) {
    console.error('Get Resident Clinical Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch resident clinical chart' })
  }
}

// ── Doctor edits of existing resident clinical rows (diagnosis "previous" records) ──

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

/**
 * Checks doctor access to the resident, then runs the write with `{ residentId, id, userId }`.
 */
async function withDoctorClinicalItem(
  req: AuthenticatedRequest,
  res: Response,
  logLabel: string,
  action: (params: { residentId: string; id: string; userId: string | null }) => Promise<void>,
): Promise<void> {
  try {
    const residentId = String(req.params.residentId)
    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }
    await action({ residentId, id: String(req.params.id), userId: req.user?.id ?? null })
  } catch (err) {
    sendError(res, err, logLabel)
  }
}

/**
 * PUT /doctor/residents/:residentId/allergies/:id
 */
export async function updateDoctorResidentAllergy(req: AuthenticatedRequest, res: Response): Promise<void> {
  await withDoctorClinicalItem(req, res, 'updateDoctorResidentAllergy', async (params) => {
    const data = await updateResidentAllergy({ ...params, input: req.body as UpdateResidentAllergyInput })
    res.status(200).json({ success: true, message: 'Allergy updated successfully', data })
  })
}

/**
 * DELETE /doctor/residents/:residentId/allergies/:id (soft)
 */
export async function deleteDoctorResidentAllergy(req: AuthenticatedRequest, res: Response): Promise<void> {
  await withDoctorClinicalItem(req, res, 'deleteDoctorResidentAllergy', async (params) => {
    await deleteResidentAllergy(params)
    res.status(200).json({ success: true, message: 'Allergy deleted successfully' })
  })
}

/**
 * PUT /doctor/residents/:residentId/vitals/:id
 */
export async function updateDoctorResidentVital(req: AuthenticatedRequest, res: Response): Promise<void> {
  await withDoctorClinicalItem(req, res, 'updateDoctorResidentVital', async (params) => {
    const data = await updateResidentVital({ ...params, input: req.body as UpdateResidentVitalInput })
    res.status(200).json({ success: true, message: 'Vital updated successfully', data })
  })
}

/**
 * DELETE /doctor/residents/:residentId/vitals/:id (soft)
 */
export async function deleteDoctorResidentVital(req: AuthenticatedRequest, res: Response): Promise<void> {
  await withDoctorClinicalItem(req, res, 'deleteDoctorResidentVital', async (params) => {
    await deleteResidentVital(params)
    res.status(200).json({ success: true, message: 'Vital deleted successfully' })
  })
}

/**
 * PUT /doctor/residents/:residentId/medications/:id
 */
export async function updateDoctorResidentMedication(req: AuthenticatedRequest, res: Response): Promise<void> {
  await withDoctorClinicalItem(req, res, 'updateDoctorResidentMedication', async (params) => {
    const data = await updateResidentMedication({ ...params, input: req.body as UpdateResidentMedicationInput })
    res.status(200).json({ success: true, message: 'Medication updated successfully', data })
  })
}

/**
 * DELETE /doctor/residents/:residentId/medications/:id (soft)
 */
export async function deleteDoctorResidentMedication(req: AuthenticatedRequest, res: Response): Promise<void> {
  await withDoctorClinicalItem(req, res, 'deleteDoctorResidentMedication', async (params) => {
    await deleteResidentMedication(params)
    res.status(200).json({ success: true, message: 'Medication deleted successfully' })
  })
}

/**
 * PUT /doctor/residents/:residentId/insulin/:id
 */
export async function updateDoctorResidentInsulin(req: AuthenticatedRequest, res: Response): Promise<void> {
  await withDoctorClinicalItem(req, res, 'updateDoctorResidentInsulin', async (params) => {
    const data = await updateResidentInsulin({ ...params, input: req.body as UpdateResidentMedicationInput })
    res.status(200).json({ success: true, message: 'Insulin updated successfully', data })
  })
}

/**
 * DELETE /doctor/residents/:residentId/insulin/:id (soft)
 */
export async function deleteDoctorResidentInsulin(req: AuthenticatedRequest, res: Response): Promise<void> {
  await withDoctorClinicalItem(req, res, 'deleteDoctorResidentInsulin', async (params) => {
    await deleteResidentInsulin(params)
    res.status(200).json({ success: true, message: 'Insulin deleted successfully' })
  })
}
