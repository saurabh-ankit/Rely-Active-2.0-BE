import sequelize from '../config/db/index.js'
import { Consultant, ResidentAllergy, ResidentInsulin, ResidentMedication, ResidentVital } from '../models/index.js'
import { syncAppointmentAllergies } from '../services/residentAllergy.service.js'
import { syncAppointmentInsulin } from '../services/residentInsulin.service.js'
import { syncAppointmentMedications } from '../services/residentMedication.service.js'
import { syncAppointmentVitals } from '../services/residentVital.service.js'

async function main() {
  await sequelize.authenticate()
  const rows = await Consultant.findAll({ where: { isDeleted: false } })
  console.log('consultants', rows.length)

  for (const row of rows) {
    const data = row.toJSON()
    const allergies = Array.isArray(data.allergies) ? data.allergies : []
    const meds = Array.isArray(data.medications) ? data.medications : []
    const insulin = Array.isArray(data.insulin) ? data.insulin : []
    const vitals = Array.isArray(data.vitals) ? data.vitals : []
    console.log(
      'syncing appointment',
      data.appointmentId,
      'allergies',
      allergies.length,
      'meds',
      meds.length,
      'insulin',
      insulin.length,
      'vitals',
      vitals.length,
    )

    await syncAppointmentAllergies({
      residentId: data.residentId,
      locationId: data.locationId,
      appointmentId: data.appointmentId,
      allergies,
      userId: data.updatedBy ?? null,
    })
    await syncAppointmentMedications({
      residentId: data.residentId,
      locationId: data.locationId,
      appointmentId: data.appointmentId,
      medications: meds,
      userId: data.updatedBy ?? null,
    })
    await syncAppointmentInsulin({
      residentId: data.residentId,
      locationId: data.locationId,
      appointmentId: data.appointmentId,
      insulin,
      userId: data.updatedBy ?? null,
    })
    await syncAppointmentVitals({
      residentId: data.residentId,
      locationId: data.locationId,
      appointmentId: data.appointmentId,
      vitals,
      userId: data.updatedBy ?? null,
    })
  }

  console.log('resident_allergies', await ResidentAllergy.count({ where: { isDeleted: false } }))
  console.log('resident_medications', await ResidentMedication.count({ where: { isDeleted: false } }))
  console.log('resident_insulin', await ResidentInsulin.count({ where: { isDeleted: false } }))
  console.log('resident_vitals', await ResidentVital.count({ where: { isDeleted: false } }))
  await sequelize.close()
}

main().catch(async (err) => {
  console.error('BACKFILL FAILED:', err)
  await sequelize.close()
  process.exit(1)
})
