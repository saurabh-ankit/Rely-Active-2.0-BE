import { OFFSET_MIN, userNameSql } from '../dashboardQuery.service.js'
import {
  activeFilter,
  familyNameSql,
  flatIs,
  fullName,
  inRange,
  localDateTime,
  options,
  overlapsRange,
  unitSql,
  ymd,
  yesNo,
  type ReportSection,
} from './reportSql.js'

/** The Medical report's tabs after Appointments: each resident's clinical records, then the care catalogues. */

/** `after_food` / `MORNING` → `After food` / `Morning`. */
const wordsSql = (col: string) => `CONCAT(UPPER(LEFT(${col}, 1)), LOWER(REPLACE(SUBSTRING(${col}, 2), '_', ' ')))`
/** A decimal without trailing zeros (`250.00` → `250`). */
const plainNumber = (expr: string) => `(${expr} + 0e0)`
const prettyDate = (col: string) => `DATE_FORMAT(${col}, '%d %b %Y')`

/** `oral` / `sc` → `Oral` / `SC`. */
const routeSql = (col: string) => `IF(CHAR_LENGTH(${col}) <= 2, UPPER(${col}), ${wordsSql(`NULLIF(${col}, '')`)})`

/** A medicine's selected timings as `Morning · 08:00 · Dose 1 · Oral · After food | Night · …`. */
const scheduleSql = (col: string) => `(SELECT GROUP_CONCAT(CONCAT_WS(' · ',
      ${wordsSql('jt.timeOfDay')}, NULLIF(jt.time, ''), CONCAT('Dose ', ${plainNumber('jt.dose')}),
      ${routeSql('jt.route')},
      ${wordsSql("NULLIF(NULLIF(jt.mealTiming, ''), 'none')")})
    ORDER BY jt.ord SEPARATOR ' | ')
  FROM JSON_TABLE(${col}, '$[*]' COLUMNS (
    ord FOR ORDINALITY,
    timeOfDay VARCHAR(30) PATH '$.timeOfDay',
    selected VARCHAR(5) PATH '$.selected',
    time VARCHAR(10) PATH '$.time',
    dose DECIMAL(10, 2) PATH '$.dose',
    route VARCHAR(30) PATH '$.route',
    mealTiming VARCHAR(30) PATH '$.mealTiming')) jt
  WHERE jt.selected = 'true')`

/** A medicine's period as `01 Sep 2026 to 30 Sep 2026` / `… until discharge`. */
const periodSql = (alias: string) => `CONCAT_WS(' ', CONCAT('From ', ${prettyDate(`${alias}.startDate`)}),
  IF(${alias}.isUntilDischarge = 1, 'until discharge', CONCAT('to ', ${prettyDate(`${alias}.endDate`)})))`

/** A lab report's time: when it was added, if that was on the report date; otherwise the start of that day. */
const labReportAt = `IF(DATE(lr.createdAt + INTERVAL ${OFFSET_MIN} MINUTE) = lr.reportDate, lr.createdAt,
  TIMESTAMP(lr.reportDate) - INTERVAL ${OFFSET_MIN} MINUTE)`

const jsonCount = (col: string) => `COALESCE(JSON_LENGTH(${col}), 0)`

const RESIDENT_COLUMNS = [
  { key: 'resident', header: 'Resident' },
  { key: 'flat', header: 'Flat' },
] as const

/** Resident name and flat, for a table joined as `rs`. */
const residentSelect = `${fullName('rs')} AS resident, ${unitSql('rs.unitId')} AS flat`
/** The flat condition for a table joined as `rs` (family members' records carry their resident's id). */
const residentFlat = flatIs('rs.unitId')

/** Every clinical event of the property's residents, as the resident Timeline tab lists them. */
const timelineEvents = `
  SELECT v.recordedAt AS at, v.residentId, 'Vital' AS type, 'Vital Recorded' AS event,
    CONCAT_WS(' — ', CONCAT(v.name, ': ', COALESCE(NULLIF(v.value, ''), '-'), IF(COALESCE(v.unit, '') = '', '', CONCAT(' ', v.unit))),
      NULLIF(v.note, '')) AS details, v.createdBy AS byUser
  FROM resident_vitals v WHERE v.locationId = :loc AND v.isDeleted = 0 AND ${inRange('v.recordedAt')}
  UNION ALL
  SELECT MIN(fb.recordedAt), ANY_VALUE(fb.residentId), 'Fluid Balance', 'Fluid Balance Recorded',
    CONCAT_WS(', ',
      IF(SUM(fb.category = 'INTAKE') > 0, CONCAT('Intake: ', ${plainNumber("ROUND(SUM(IF(fb.category = 'INTAKE', fb.quantityMl, 0)), 2)")}, ' ml'), NULL),
      IF(SUM(fb.category = 'OUTPUT') > 0, CONCAT('Output: ', ${plainNumber("ROUND(SUM(IF(fb.category = 'OUTPUT', fb.quantityMl, 0)), 2)")}, ' ml'), NULL),
      IF(SUM(fb.category = 'BOWEL') > 0, CONCAT('Bowel: ', SUM(fb.category = 'BOWEL')), NULL)),
    ANY_VALUE(fb.createdBy)
  FROM resident_fluid_balances fb WHERE fb.locationId = :loc AND fb.isDeleted = 0 AND ${inRange('fb.recordedAt')}
  GROUP BY fb.batchId
  UNION ALL
  SELECT m.createdAt, m.residentId, 'Medication', CONCAT('Medication Assigned: ', m.medicineName),
    CONCAT_WS(' — ', ${periodSql('m')}, NULLIF(m.note, '')), m.createdBy
  FROM resident_medications m WHERE m.locationId = :loc AND m.isDeleted = 0 AND ${inRange('m.createdAt')}
  UNION ALL
  SELECT i.createdAt, i.residentId, 'Insulin', CONCAT('Insulin Assigned: ', i.medicineName),
    CONCAT_WS(' — ', ${periodSql('i')}, NULLIF(i.note, '')), i.createdBy
  FROM resident_insulin i WHERE i.locationId = :loc AND i.isDeleted = 0 AND ${inRange('i.createdAt')}
  UNION ALL
  SELECT ma.completedAt, ma.residentId, IF(ma.kind = 'INSULIN', 'Insulin', 'Medication'),
    CONCAT(IF(ma.kind = 'INSULIN', 'Insulin', 'Medication'), ' Given: ', ma.medicineName, ' (', ${wordsSql('ma.timeOfDay')}, ')'),
    CONCAT_WS(' — ', CONCAT('Dose: ', ${plainNumber('ma.dose')}, IF(ma.kind = 'INSULIN', ' units', '')), NULLIF(ma.notes, '')),
    ma.completedBy
  FROM resident_medication_administrations ma
  WHERE ma.locationId = :loc AND ma.isDeleted = 0 AND ma.status = 'COMPLETED' AND ${inRange('ma.completedAt')}
  UNION ALL
  SELECT ma.cancelledAt, ma.residentId, IF(ma.kind = 'INSULIN', 'Insulin', 'Medication'),
    CONCAT(IF(ma.kind = 'INSULIN', 'Insulin', 'Medication'), ' Dose Cancelled: ', ma.medicineName, ' (', ${wordsSql('ma.timeOfDay')}, ')'),
    CONCAT_WS(' — ', CONCAT('Dose: ', ${plainNumber('ma.dose')}, IF(ma.kind = 'INSULIN', ' units', '')), NULLIF(ma.cancelReason, '')),
    ma.cancelledBy
  FROM resident_medication_administrations ma
  WHERE ma.locationId = :loc AND ma.isDeleted = 0 AND ma.status = 'CANCELLED' AND ${inRange('ma.cancelledAt')}
  UNION ALL
  SELECT ${labReportAt}, lr.residentId, 'Lab Report', 'Lab Report Added',
    CONCAT_WS(' — ', CONCAT(COALESCE(lt.name, 'Lab test'), ' (', ${wordsSql('lr.severity')}, ')'), NULLIF(lr.notes, '')),
    lr.createdBy
  FROM resident_lab_reports lr LEFT JOIN lab_test_settings lt ON lt.id = lr.labTestSettingId
  WHERE lr.locationId = :loc AND lr.isDeleted = 0 AND ${inRange(labReportAt)}
  UNION ALL
  SELECT al.recordedAt, al.residentId, 'Allergy', 'Allergy Recorded', CONCAT_WS(' — ', al.name, NULLIF(al.note, '')),
    al.createdBy
  FROM resident_allergies al WHERE al.locationId = :loc AND al.isDeleted = 0 AND ${inRange('al.recordedAt')}
  UNION ALL
  SELECT ri.incidentAt, ri.residentId, 'Incident', 'Incident Reported',
    CONCAT_WS(' — ', CONCAT('Type: ', ${wordsSql('ri.incidentType')}), CONCAT('Severity: ', ${wordsSql('ri.severity')}),
      NULLIF(ri.notes, '')),
    ri.createdBy
  FROM resident_incidents ri WHERE ri.locationId = :loc AND ri.isDeleted = 0 AND ${inRange('ri.incidentAt')}
  UNION ALL
  SELECT cl.createdAt, cl.residentId, 'Condition', 'Condition Updated',
    CONCAT_WS(' — ', CONCAT('Condition: ', ${wordsSql('cl.`condition`')}), NULLIF(cl.note, '')), cl.createdBy
  FROM resident_condition_logs cl WHERE cl.locationId = :loc AND cl.isDeleted = 0 AND ${inRange('cl.createdAt')}
  UNION ALL
  SELECT COALESCE(da.bookedAt, da.createdAt), da.residentId, 'Appointment', 'Appointment Booked',
    CONCAT_WS(' — ', CONCAT('Doctor visit scheduled for ', ${prettyDate('da.appointmentDate')}, ', ', da.slotTimeRange),
      NULLIF(da.notes, '')),
    da.createdBy
  FROM doctor_appointments da
  WHERE da.locationId = :loc AND da.isDeleted = 0 AND ${inRange('COALESCE(da.bookedAt, da.createdAt)')}
  UNION ALL
  SELECT da.cancelledAt, da.residentId, 'Appointment', 'Appointment Cancelled',
    CONCAT_WS(' — ', CONCAT('Doctor visit for ', ${prettyDate('da.appointmentDate')}, ', ', da.slotTimeRange, ' was cancelled'),
      NULLIF(da.cancellationReason, '')),
    da.updatedBy
  FROM doctor_appointments da
  WHERE da.locationId = :loc AND da.isDeleted = 0 AND da.status = 'CANCELLED' AND ${inRange('da.cancelledAt')}
  UNION ALL
  SELECT da.updatedAt, da.residentId, 'Appointment', 'Appointment Missed',
    CONCAT('Resident did not attend the doctor visit for ', ${prettyDate('da.appointmentDate')}, ', ', da.slotTimeRange),
    da.updatedBy
  FROM doctor_appointments da
  WHERE da.locationId = :loc AND da.isDeleted = 0 AND da.status = 'NO_SHOW' AND ${inRange('da.updatedAt')}
  UNION ALL
  SELECT c.completedAt, c.residentId, 'Doctor Visit', 'Doctor Visit Completed',
    CONCAT_WS(' — ', CONCAT('Condition: ', ${wordsSql('c.`condition`')}), NULLIF(c.note, '')), c.doctorId
  FROM consultants c
  WHERE c.locationId = :loc AND c.isDeleted = 0 AND c.status = 'COMPLETED' AND ${inRange('c.completedAt')}
  UNION ALL
  SELECT cta.createdAt, cta.residentId, 'Care Task', 'Care Task Assigned',
    CONCAT_WS(' — ', ct.careTaskName, NULLIF(cta.customInstructions, '')), cta.createdBy
  FROM care_task_assignments cta LEFT JOIN care_tasks ct ON ct.id = cta.taskId
  WHERE cta.propertyId = :loc AND cta.isDeleted = 0 AND ${inRange('cta.createdAt')}
  UNION ALL
  SELECT cta.stoppedAt, cta.residentId, 'Care Task',
    IF(cta.status = 'CANCELLED', 'Care Task Cancelled', 'Care Task Stopped'), ct.careTaskName, cta.stoppedBy
  FROM care_task_assignments cta LEFT JOIN care_tasks ct ON ct.id = cta.taskId
  WHERE cta.propertyId = :loc AND cta.isDeleted = 0 AND ${inRange('cta.stoppedAt')}
  UNION ALL
  SELECT tc.completedAt, tc.residentId, 'Care Task',
    IF(tc.status = 'CANCELLED', 'Care Task Cancelled', 'Care Task Completed'),
    CONCAT_WS(' — ', ct.careTaskName, COALESCE(NULLIF(tc.remarks, ''), NULLIF(tc.description, ''))), tc.completedBy
  FROM resident_care_task_completions tc LEFT JOIN care_tasks ct ON ct.id = tc.taskId
  WHERE tc.propertyId = :loc AND tc.isDeleted = 0 AND ${inRange('tc.completedAt')}`

const TIMELINE_TYPES = [
  'Vital',
  'Fluid Balance',
  'Medication',
  'Insulin',
  'Lab Report',
  'Allergy',
  'Incident',
  'Condition',
  'Appointment',
  'Doctor Visit',
  'Care Task',
]

export const MEDICAL_SECTIONS: ReportSection[] = [
  {
    key: 'vitals',
    title: 'Vitals',
    description: 'Every vital reading with resident, vital, value, unit and note.',
    dateBasis: 'Time recorded',
    flat: residentFlat,
    columns: [
      { key: 'recordedAt', header: 'Recorded At', type: 'datetime' },
      ...RESIDENT_COLUMNS,
      { key: 'vital', header: 'Vital' },
      { key: 'value', header: 'Value' },
      { key: 'unit', header: 'Unit' },
      { key: 'note', header: 'Note' },
      { key: 'recordedBy', header: 'Recorded By' },
    ],
    sql: (status) => `
      SELECT ${localDateTime('v.recordedAt')} AS recordedAt, ${residentSelect}, v.name AS vital, v.value,
        v.unit AS unit, v.note, ${userNameSql('v.createdBy')} AS recordedBy
      FROM resident_vitals v
      LEFT JOIN residents rs ON rs.id = v.residentId
      WHERE v.locationId = :loc AND v.isDeleted = 0 AND ${inRange('v.recordedAt')} ${status}
      ORDER BY v.recordedAt, resident`,
  },
  {
    key: 'medications',
    title: 'Medications',
    description: 'Prescribed medicines and insulin with schedule, dose, route and period.',
    dateBasis: 'Prescriptions active on any day in the range',
    flat: residentFlat,
    filter: { label: 'Type', column: 'm.type', options: options('Medication', 'Insulin') },
    columns: [
      { key: 'type', header: 'Type' },
      ...RESIDENT_COLUMNS,
      { key: 'medicine', header: 'Medicine' },
      { key: 'schedule', header: 'Schedule' },
      { key: 'startDate', header: 'Start Date', type: 'date' },
      { key: 'endDate', header: 'End Date', type: 'date' },
      { key: 'untilDischarge', header: 'Until Discharge' },
      { key: 'note', header: 'Note' },
      { key: 'status', header: 'Status' },
      { key: 'prescribedBy', header: 'Prescribed By' },
      { key: 'prescribedAt', header: 'Prescribed At', type: 'datetime' },
    ],
    sql: (status) => {
      const prescriptions = (table: string, type: string) => `
        SELECT '${type}' AS type, x.residentId, x.medicineName AS medicine, ${scheduleSql('x.timings')} AS schedule,
          x.startDate, x.endDate, x.isUntilDischarge, x.note, x.isActive, x.createdBy, x.createdAt
        FROM ${table} x
        WHERE x.locationId = :loc AND x.isDeleted = 0
          AND ${overlapsRange('x.startDate', 'IF(x.isUntilDischarge = 1, NULL, x.endDate)')}`
      return `
        SELECT m.type, ${residentSelect}, m.medicine, m.schedule, ${ymd('m.startDate')} AS startDate,
          ${ymd('m.endDate')} AS endDate, ${yesNo('m.isUntilDischarge')} AS untilDischarge, m.note,
          IF(m.isActive = 1, 'Active', 'Inactive') AS status, ${userNameSql('m.createdBy')} AS prescribedBy,
          ${localDateTime('m.createdAt')} AS prescribedAt
        FROM (${prescriptions('resident_medications', 'Medication')}
          UNION ALL ${prescriptions('resident_insulin', 'Insulin')}) m
        LEFT JOIN residents rs ON rs.id = m.residentId
        WHERE 1 = 1 ${status}
        ORDER BY m.startDate, resident, m.medicine`
    },
  },
  {
    key: 'medication-given',
    title: 'Medication Given',
    description: 'Each scheduled dose with dose, route, meal timing, who gave or cancelled it and stock deducted.',
    dateBasis: 'Scheduled date',
    flat: residentFlat,
    filter: {
      label: 'Status',
      column: 'ma.status',
      options: [
        { value: 'COMPLETED', label: 'Given' },
        { value: 'CANCELLED', label: 'Cancelled' },
      ],
    },
    columns: [
      { key: 'scheduledDate', header: 'Scheduled Date', type: 'date' },
      { key: 'scheduledTime', header: 'Scheduled Time' },
      { key: 'timeOfDay', header: 'Time of Day', humanize: true },
      ...RESIDENT_COLUMNS,
      { key: 'type', header: 'Type', humanize: true },
      { key: 'medicine', header: 'Medicine' },
      { key: 'dose', header: 'Dose', type: 'number' },
      { key: 'route', header: 'Route' },
      { key: 'mealTiming', header: 'Meal Timing', humanize: true },
      { key: 'status', header: 'Status' },
      { key: 'doneBy', header: 'Given / Cancelled By' },
      { key: 'doneAt', header: 'Given / Cancelled At', type: 'datetime' },
      { key: 'notes', header: 'Notes / Cancel Reason' },
      { key: 'stockStatus', header: 'Stock', humanize: true },
      { key: 'deductedQuantity', header: 'Quantity Deducted', type: 'number', total: true },
    ],
    sql: (status) => `
      SELECT ${ymd('ma.scheduledDate')} AS scheduledDate, ma.scheduledTime, ma.timeOfDay, ${residentSelect},
        ma.kind AS type, ma.medicineName AS medicine, ma.dose, ${routeSql('ma.route')} AS route, NULLIF(ma.mealTiming, 'none') AS mealTiming,
        IF(ma.status = 'CANCELLED', 'Cancelled', 'Given') AS status, ${userNameSql("IF(ma.status = 'CANCELLED', ma.cancelledBy, ma.completedBy)")} AS doneBy,
        ${localDateTime("IF(ma.status = 'CANCELLED', ma.cancelledAt, ma.completedAt)")} AS doneAt,
        IF(ma.status = 'CANCELLED', ma.cancelReason, ma.notes) AS notes, ma.stockStatus, ma.deductedQuantity
      FROM resident_medication_administrations ma
      LEFT JOIN residents rs ON rs.id = ma.residentId
      WHERE ma.locationId = :loc AND ma.isDeleted = 0 AND ma.scheduledDate BETWEEN :from AND :to ${status}
      ORDER BY ma.scheduledDate, ma.scheduledTime, resident`,
  },
  {
    key: 'lab-reports',
    title: 'Lab Reports',
    description: 'Lab reports with test, severity, cost and payment.',
    dateBasis: 'Report date',
    flat: residentFlat,
    filter: { label: 'Severity', column: 'lr.severity', options: options('normal', 'abnormal', 'severe') },
    columns: [
      { key: 'reportDate', header: 'Report Date', type: 'date' },
      ...RESIDENT_COLUMNS,
      { key: 'test', header: 'Test' },
      { key: 'severity', header: 'Severity', humanize: true },
      { key: 'cost', header: 'Cost (₹)', type: 'money', total: true },
      { key: 'paid', header: 'Paid' },
      { key: 'paymentMethod', header: 'Payment Method', humanize: true },
      { key: 'notes', header: 'Notes' },
      { key: 'addedBy', header: 'Added By' },
      { key: 'addedAt', header: 'Added At', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT ${ymd('lr.reportDate')} AS reportDate, ${residentSelect}, lt.name AS test, lr.severity, lr.cost,
        ${yesNo('lr.is_paid')} AS paid, lr.paymentMethod, lr.notes, ${userNameSql('lr.createdBy')} AS addedBy,
        ${localDateTime('lr.createdAt')} AS addedAt
      FROM resident_lab_reports lr
      LEFT JOIN residents rs ON rs.id = lr.residentId
      LEFT JOIN lab_test_settings lt ON lt.id = lr.labTestSettingId
      WHERE lr.locationId = :loc AND lr.isDeleted = 0 AND lr.reportDate BETWEEN :from AND :to ${status}
      ORDER BY lr.reportDate, resident`,
  },
  {
    key: 'allergies',
    title: 'Allergies',
    description: 'Allergies recorded for residents, with notes.',
    dateBasis: 'Time recorded',
    flat: residentFlat,
    columns: [
      { key: 'recordedAt', header: 'Recorded At', type: 'datetime' },
      ...RESIDENT_COLUMNS,
      { key: 'allergy', header: 'Allergy' },
      { key: 'note', header: 'Note' },
      { key: 'status', header: 'Status' },
      { key: 'recordedBy', header: 'Recorded By' },
    ],
    sql: (status) => `
      SELECT ${localDateTime('al.recordedAt')} AS recordedAt, ${residentSelect}, al.name AS allergy, al.note,
        IF(al.isActive = 1, 'Active', 'Inactive') AS status, ${userNameSql('al.createdBy')} AS recordedBy
      FROM resident_allergies al
      LEFT JOIN residents rs ON rs.id = al.residentId
      WHERE al.locationId = :loc AND al.isDeleted = 0 AND ${inRange('al.recordedAt')} ${status}
      ORDER BY al.recordedAt, resident`,
  },
  {
    key: 'fluid-balance',
    title: 'Fluid Balance',
    description: 'Fluid intake, output and bowel entries with type, quantity, stool type and comfort.',
    dateBasis: 'Time recorded',
    flat: residentFlat,
    filter: { label: 'Category', column: 'fb.category', options: options('INTAKE', 'OUTPUT', 'BOWEL') },
    columns: [
      { key: 'recordedAt', header: 'Recorded At', type: 'datetime' },
      ...RESIDENT_COLUMNS,
      { key: 'category', header: 'Category', humanize: true },
      { key: 'fluidType', header: 'Fluid Type', humanize: true },
      { key: 'ivFluidType', header: 'IV Fluid' },
      { key: 'description', header: 'Description' },
      { key: 'quantity', header: 'Quantity', type: 'number' },
      { key: 'unit', header: 'Unit' },
      { key: 'quantityMl', header: 'Quantity (ml)', type: 'number', total: true },
      { key: 'stoolType', header: 'Stool Type', humanize: true },
      { key: 'comfortLevel', header: 'Comfort', humanize: true },
      { key: 'collectedBy', header: 'Collected By' },
      { key: 'note', header: 'Note' },
      { key: 'recordedBy', header: 'Recorded By' },
    ],
    sql: (status) => `
      SELECT ${localDateTime('fb.recordedAt')} AS recordedAt, ${residentSelect}, fb.category, fb.fluidType,
        UPPER(REPLACE(fb.ivFluidType, '_', ' ')) AS ivFluidType, fb.description, fb.quantity, fb.unit, fb.quantityMl,
        fb.stoolType, fb.comfortLevel, fb.collectedBy, fb.note, ${userNameSql('fb.createdBy')} AS recordedBy
      FROM resident_fluid_balances fb
      LEFT JOIN residents rs ON rs.id = fb.residentId
      WHERE fb.locationId = :loc AND fb.isDeleted = 0 AND ${inRange('fb.recordedAt')} ${status}
      ORDER BY fb.recordedAt, resident, fb.category`,
  },
  {
    key: 'incidents',
    title: 'Incidents',
    description: 'Incidents with type, severity, notes and photos.',
    dateBasis: 'Incident time',
    flat: residentFlat,
    filter: { label: 'Severity', column: 'ri.severity', options: options('low', 'moderate', 'high', 'critical') },
    columns: [
      { key: 'incidentAt', header: 'Incident At', type: 'datetime' },
      ...RESIDENT_COLUMNS,
      { key: 'incidentType', header: 'Type', humanize: true },
      { key: 'severity', header: 'Severity', humanize: true },
      { key: 'notes', header: 'Notes' },
      { key: 'photos', header: 'Photos', type: 'number' },
      { key: 'voiceNotes', header: 'Voice Notes', type: 'number' },
      { key: 'reportedBy', header: 'Reported By' },
    ],
    sql: (status) => `
      SELECT ${localDateTime('ri.incidentAt')} AS incidentAt, ${residentSelect}, ri.incidentType, ri.severity, ri.notes,
        ${jsonCount('ri.photos')} AS photos, ${jsonCount('ri.voiceNotes')} AS voiceNotes,
        ${userNameSql('ri.createdBy')} AS reportedBy
      FROM resident_incidents ri
      LEFT JOIN residents rs ON rs.id = ri.residentId
      WHERE ri.locationId = :loc AND ri.isDeleted = 0 AND ${inRange('ri.incidentAt')} ${status}
      ORDER BY ri.incidentAt, resident`,
  },
  {
    key: 'timeline',
    title: 'Timeline',
    description:
      'Every clinical event in order: vitals, medicines, lab reports, incidents, condition, visits and care tasks.',
    dateBasis: 'Event time',
    flat: residentFlat,
    filter: { label: 'Event Type', column: 't.type', options: TIMELINE_TYPES.map((t) => ({ value: t, label: t })) },
    columns: [
      { key: 'at', header: 'Date & Time', type: 'datetime' },
      ...RESIDENT_COLUMNS,
      { key: 'type', header: 'Type' },
      { key: 'event', header: 'Event' },
      { key: 'details', header: 'Details' },
      { key: 'by', header: 'By' },
    ],
    sql: (status) => `
      SELECT ${localDateTime('t.at')} AS at, ${residentSelect}, t.type, t.event, t.details,
        ${userNameSql('t.byUser')} AS \`by\`
      FROM (${timelineEvents}) t
      LEFT JOIN residents rs ON rs.id = t.residentId
      WHERE 1 = 1 ${status}
      ORDER BY t.at, resident`,
  },
  {
    key: 'doctor-notes',
    title: 'Doctor Notes',
    description: 'Notes from completed doctor visits with condition and attachments.',
    dateBasis: 'Visit date',
    flat: residentFlat,
    filter: {
      label: 'Condition',
      column: 'c.`condition`',
      options: options('CRITICAL', 'STABLE', 'RECOVERING', 'GOOD'),
    },
    columns: [
      { key: 'visitDate', header: 'Visit Date', type: 'date' },
      ...RESIDENT_COLUMNS,
      { key: 'doctor', header: 'Doctor' },
      { key: 'condition', header: 'Condition', humanize: true },
      { key: 'note', header: 'Note' },
      { key: 'attachments', header: 'Attachments', type: 'number' },
      { key: 'voiceNotes', header: 'Voice Notes', type: 'number' },
      { key: 'completedAt', header: 'Completed At', type: 'datetime' },
    ],
    sql: (status) => {
      const visitDay = `COALESCE(da.appointmentDate, DATE(c.completedAt + INTERVAL ${OFFSET_MIN} MINUTE))`
      return `
        SELECT ${ymd(visitDay)} AS visitDate, ${residentSelect}, ${userNameSql('c.doctorId')} AS doctor,
          c.\`condition\` AS \`condition\`, NULLIF(TRIM(c.note), '') AS note, ${jsonCount('c.attachments')} AS attachments,
          ${jsonCount('c.voiceNotes')} AS voiceNotes, ${localDateTime('c.completedAt')} AS completedAt
        FROM consultants c
        LEFT JOIN doctor_appointments da ON da.id = c.appointmentId
        LEFT JOIN residents rs ON rs.id = c.residentId
        WHERE c.locationId = :loc AND c.isDeleted = 0 AND c.status = 'COMPLETED'
          AND ${visitDay} BETWEEN :from AND :to
          AND (NULLIF(TRIM(c.note), '') IS NOT NULL OR c.\`condition\` IS NOT NULL
            OR ${jsonCount('c.attachments')} > 0 OR ${jsonCount('c.voiceNotes')} > 0) ${status}
        ORDER BY ${visitDay}, c.completedAt, resident`
    },
  },
  {
    key: 'care-task-assignments',
    title: 'Care Task Assignments',
    description: 'Care tasks assigned to residents with package, billing, schedule, nurse and status.',
    dateBasis: 'Assignments active on any day in the range',
    flat: residentFlat,
    filter: { label: 'Status', column: 'cta.status', options: options('ACTIVE', 'STOPPED', 'CANCELLED') },
    columns: [
      ...RESIDENT_COLUMNS,
      { key: 'familyMember', header: 'Family Member' },
      { key: 'task', header: 'Care Task' },
      { key: 'source', header: 'Source', humanize: true },
      { key: 'package', header: 'Care Package' },
      { key: 'billingType', header: 'Billing', humanize: true },
      { key: 'price', header: 'Price (₹)', type: 'money' },
      { key: 'frequency', header: 'Frequency', type: 'number' },
      { key: 'time', header: 'Time' },
      { key: 'startDate', header: 'Start Date', type: 'date' },
      { key: 'endDate', header: 'End Date', type: 'date' },
      { key: 'nurse', header: 'Nurse' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'timesCompleted', header: 'Times Completed', type: 'number', total: true },
      { key: 'instructions', header: 'Instructions' },
      { key: 'assignedAt', header: 'Assigned At', type: 'datetime' },
    ],
    sql: (status) => {
      const start = `COALESCE(cta.startDate, DATE(cta.createdAt + INTERVAL ${OFFSET_MIN} MINUTE))`
      return `
        SELECT ${residentSelect}, ${familyNameSql('cta.familyMemberId')} AS familyMember, ct.careTaskName AS task,
          cta.source, pk.packageName AS package, cta.billingType, cta.price, cta.frequency, cta.time,
          ${ymd('cta.startDate')} AS startDate, ${ymd('cta.endDate')} AS endDate, ${userNameSql('cta.nurseId')} AS nurse,
          cta.status, cta.completionCount AS timesCompleted, cta.customInstructions AS instructions,
          ${localDateTime('cta.createdAt')} AS assignedAt
        FROM care_task_assignments cta
        LEFT JOIN care_tasks ct ON ct.id = cta.taskId
        LEFT JOIN packages pk ON pk.id = cta.carePackageId
        LEFT JOIN residents rs ON rs.id = cta.residentId
        WHERE cta.propertyId = :loc AND cta.isDeleted = 0 AND ${overlapsRange(start, 'cta.endDate')} ${status}
        ORDER BY ${start}, resident, task`
    },
  },
  {
    key: 'care-task-log',
    title: 'Care Task Log',
    description: 'Each time a care task was completed or cancelled, with who did it and remarks.',
    dateBasis: 'Time completed',
    flat: residentFlat,
    filter: { label: 'Status', column: 'tc.status', options: options('COMPLETED', 'CANCELLED') },
    columns: [
      { key: 'completedAt', header: 'Completed At', type: 'datetime' },
      ...RESIDENT_COLUMNS,
      { key: 'familyMember', header: 'Family Member' },
      { key: 'task', header: 'Care Task' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'completedBy', header: 'Completed By' },
      { key: 'description', header: 'Description' },
      { key: 'remarks', header: 'Remarks' },
    ],
    sql: (status) => `
      SELECT ${localDateTime('tc.completedAt')} AS completedAt, ${residentSelect},
        ${familyNameSql('tc.familyMemberId')} AS familyMember, ct.careTaskName AS task, tc.status,
        ${userNameSql('tc.completedBy')} AS completedBy, tc.description, tc.remarks
      FROM resident_care_task_completions tc
      LEFT JOIN care_tasks ct ON ct.id = tc.taskId
      LEFT JOIN residents rs ON rs.id = tc.residentId
      WHERE tc.propertyId = :loc AND tc.isDeleted = 0 AND ${inRange('tc.completedAt')} ${status}
      ORDER BY tc.completedAt, resident`,
  },
  {
    key: 'package-subscriptions',
    title: 'Package Subscriptions',
    description: 'Residents subscribed to care packages, with period, cost and status.',
    dateBasis: 'Subscriptions active on any day in the range',
    flat: residentFlat,
    filter: {
      label: 'Status',
      column: 'ps.status',
      options: options('ACTIVE', 'INACTIVE', 'CANCELLED', 'COMPLETED'),
    },
    columns: [
      ...RESIDENT_COLUMNS,
      { key: 'familyMember', header: 'Family Member' },
      { key: 'package', header: 'Care Package' },
      { key: 'startDate', header: 'Start Date', type: 'date' },
      { key: 'endDate', header: 'End Date', type: 'date' },
      { key: 'totalCost', header: 'Total Cost (₹)', type: 'money', total: true },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'notes', header: 'Notes' },
      { key: 'subscribedAt', header: 'Subscribed At', type: 'datetime' },
    ],
    sql: (status) => {
      const startDay = `DATE(ps.startDate + INTERVAL ${OFFSET_MIN} MINUTE)`
      const endDay = `DATE(ps.endDate + INTERVAL ${OFFSET_MIN} MINUTE)`
      return `
        SELECT ${residentSelect}, ${familyNameSql('ps.familyMemberId')} AS familyMember, pk.packageName AS package,
          ${ymd(startDay)} AS startDate, ${ymd(endDay)} AS endDate, ps.totalCost, ps.status, ps.notes,
          ${localDateTime('ps.createdAt')} AS subscribedAt
        FROM package_subscriptions ps
        LEFT JOIN packages pk ON pk.id = ps.carePackageId
        LEFT JOIN residents rs ON rs.id = ps.residentId
        WHERE ps.propertyId = :loc AND ps.isDeleted = 0 AND ${overlapsRange(startDay, endDay)} ${status}
        ORDER BY ps.startDate, resident`
    },
  },
  {
    key: 'care-tasks',
    title: 'Care Tasks List',
    description: "The property's care tasks and global templates, with billing and price.",
    dateBasis: null,
    filter: activeFilter('ct.isActive'),
    columns: [
      { key: 'task', header: 'Care Task' },
      { key: 'description', header: 'Description' },
      { key: 'billingType', header: 'Billing', humanize: true },
      { key: 'price', header: 'Price (₹)', type: 'money' },
      { key: 'scope', header: 'Scope' },
      { key: 'status', header: 'Status' },
      { key: 'createdAt', header: 'Added On', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT ct.careTaskName AS task, ct.careTaskDescription AS description, ct.billingType, ct.price,
        IF(ct.propertyId IS NULL, 'Global template', 'This property') AS scope,
        IF(ct.isActive = 1, 'Active', 'Inactive') AS status, ${localDateTime('ct.createdAt')} AS createdAt
      FROM care_tasks ct
      WHERE (ct.propertyId = :loc OR ct.propertyId IS NULL) AND ct.isDeleted = 0 ${status}
      ORDER BY ct.careTaskName`,
  },
  {
    key: 'care-packages',
    title: 'Care Packages',
    description: "The property's care packages and global templates, with cost, duration and included tasks.",
    dateBasis: null,
    filter: activeFilter('pk.isActive'),
    columns: [
      { key: 'package', header: 'Care Package' },
      { key: 'duration', header: 'Duration', humanize: true },
      { key: 'cost', header: 'Cost (₹)', type: 'money' },
      { key: 'tasks', header: 'Included Care Tasks' },
      { key: 'description', header: 'Description' },
      { key: 'scope', header: 'Scope' },
      { key: 'status', header: 'Status' },
      { key: 'createdAt', header: 'Added On', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT pk.packageName AS package, pk.duration, pk.packageCost AS cost,
        (SELECT GROUP_CONCAT(CONCAT(ct.careTaskName, IF(fm.complimentaryCount > 0, CONCAT(' ×', fm.complimentaryCount), ''))
            ORDER BY ct.careTaskName SEPARATOR ', ')
          FROM care_package_features_map fm JOIN care_tasks ct ON ct.id = fm.featureId
          WHERE fm.carePackageId = pk.id AND fm.isDeleted = 0) AS tasks,
        pk.description, IF(pk.propertyId IS NULL, 'Global template', 'This property') AS scope,
        IF(pk.isActive = 1, 'Active', 'Inactive') AS status, ${localDateTime('pk.createdAt')} AS createdAt
      FROM packages pk
      WHERE (pk.propertyId = :loc OR pk.propertyId IS NULL) AND pk.isDeleted = 0 ${status}
      ORDER BY pk.packageName`,
  },
]
