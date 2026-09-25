import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  Consultant,
  DoctorAppointment,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentAllergy,
  ResidentInsulin,
  ResidentMedication,
  ResidentVital,
} from '../../../models/index.js'
import { DiagnosisStatus } from '../../../enums/diagnosis.enum.js'
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
            attributes: ['id', 'floor_number', 'floor_name', 'blockId'],
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

    const [allergyRows, medicationRows, insulinRows, vitalRows] = await Promise.all([
      ResidentAllergy.findAll({
        where: { residentId, isDeleted: false },
        order: [['recordedAt', 'DESC']],
      }),
      ResidentMedication.findAll({
        where: { residentId, isDeleted: false },
        order: [['createdAt', 'DESC']],
      }),
      ResidentInsulin.findAll({
        where: { residentId, isDeleted: false },
        order: [['createdAt', 'DESC']],
      }),
      ResidentVital.findAll({
        where: { residentId, isDeleted: false },
        order: [['recordedAt', 'DESC']],
      }),
    ])

    const allergies = allergyRows.map((row) => {
      const data = row.toJSON ? row.toJSON() : row
      return {
        id: data.id,
        name: data.name,
        note: data.note || null,
        recordedAt: data.recordedAt instanceof Date ? data.recordedAt.toISOString() : String(data.recordedAt),
        residentId: data.residentId,
        locationId: data.locationId,
        appointmentId: data.appointmentId || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      }
    })
    const vitals = vitalRows.map((row) => {
      const data = row.toJSON ? row.toJSON() : row
      return {
        id: data.id,
        vitalSettingId: data.vitalSettingId || '',
        name: data.name,
        unit: data.unit || '',
        value: data.value || '',
        note: data.note || null,
        recordedAt: data.recordedAt instanceof Date ? data.recordedAt.toISOString() : String(data.recordedAt),
        residentId: data.residentId,
        locationId: data.locationId,
        appointmentId: data.appointmentId || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      }
    })
    const medications = medicationRows.map((row) => {
      const data = row.toJSON ? row.toJSON() : row
      return {
        id: data.id,
        inventoryItemId: data.inventoryItemId,
        medicineName: data.medicineName,
        startDate: data.startDate,
        endDate: data.endDate || null,
        isUntilDischarge: Boolean(data.isUntilDischarge),
        timings: Array.isArray(data.timings) ? data.timings : [],
        note: data.note || null,
        residentId: data.residentId,
        locationId: data.locationId,
        appointmentId: data.appointmentId || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      }
    })
    const insulin = insulinRows.map((row) => {
      const data = row.toJSON ? row.toJSON() : row
      return {
        id: data.id,
        inventoryItemId: data.inventoryItemId,
        medicineName: data.medicineName,
        startDate: data.startDate,
        endDate: data.endDate || null,
        isUntilDischarge: Boolean(data.isUntilDischarge),
        timings: Array.isArray(data.timings) ? data.timings : [],
        note: data.note || null,
        residentId: data.residentId,
        locationId: data.locationId,
        appointmentId: data.appointmentId || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      }
    })
    const doctorNotes: Array<{
      id: string
      note: string
      completedAt: string | null
      doctorId: string
      appointmentId: string
    }> = []

    const consultants = await Consultant.findAll({
      where: { residentId, isDeleted: false },
      order: [['updatedAt', 'DESC']],
    })

    for (const row of consultants) {
      const data = row.toJSON ? row.toJSON() : row
      if (data.status === DiagnosisStatus.COMPLETED && data.note && String(data.note).trim()) {
        doctorNotes.push({
          id: data.id,
          note: data.note,
          completedAt: data.completedAt ? new Date(data.completedAt).toISOString() : null,
          doctorId: data.doctorId,
          appointmentId: data.appointmentId,
        })
      }
    }

    res.status(200).json({
      success: true,
      message: 'Resident clinical chart fetched successfully',
      data: {
        profile: formatResidentProfile(resident),
        allergies,
        vitals,
        medications,
        insulin,
        doctorNotes,
      },
    })
  } catch (err) {
    console.error('Get Resident Clinical Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch resident clinical chart' })
  }
}
