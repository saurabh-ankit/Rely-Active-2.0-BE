import { userNameSql } from '../dashboardQuery.service.js'
import {
  flatIs,
  inRange,
  localDateTime,
  localDay,
  options,
  residentFlatSql,
  residentNameSql,
  unitSql,
  ymd,
  type ReportSection,
} from './reportSql.js'

/** The Assets report's tabs after Assets: the catalogues, assignments, maintenance and compliance records. */

/** A DATETIME column holding a calendar date, as its local day. */
const day = (col: string) => ymd(localDay(col))

const ASSET_COLUMNS = [
  { key: 'assetTag', header: 'Asset Tag' },
  { key: 'asset', header: 'Asset' },
] as const

/** Asset tag and name for a record with an `assetId`, keeping only this property's assets. */
const assetJoin = (alias: string) => `JOIN assets a ON a.id = ${alias}.assetId AND a.locationId = :loc
  LEFT JOIN asset_items ai ON ai.id = a.itemId`
const assetSelect = 'a.assetTag, ai.name AS asset'

/** An expiry DATETIME as Active / Expiring soon (within 30 days) / Expired. */
const expirySql = (col: string) => `CASE
  WHEN ${col} IS NULL THEN NULL
  WHEN ${col} < UTC_TIMESTAMP() THEN 'Expired'
  WHEN ${col} < UTC_TIMESTAMP() + INTERVAL 30 DAY THEN 'Expiring soon'
  ELSE 'Active' END`

export const ASSET_SECTIONS: ReportSection[] = [
  {
    key: 'categories',
    title: 'Categories',
    description: "The property's asset categories with the number of items and assets and their value.",
    dateBasis: null,
    columns: [
      { key: 'category', header: 'Category' },
      { key: 'description', header: 'Description' },
      { key: 'items', header: 'Items', type: 'number', total: true },
      { key: 'assets', header: 'Assets', type: 'number', total: true },
      { key: 'currentValue', header: 'Current Value (₹)', type: 'money', total: true },
    ],
    sql: (status) => `
      SELECT c.name AS category, c.description,
        (SELECT COUNT(*) FROM asset_items ai JOIN asset_item_locations il ON il.itemId = ai.id AND il.locationId = :loc
          WHERE ai.categoryId = c.id) AS items,
        (SELECT COUNT(*) FROM assets a JOIN asset_items ai ON ai.id = a.itemId
          WHERE a.locationId = :loc AND ai.categoryId = c.id) AS assets,
        (SELECT COALESCE(SUM(a.currentValue), 0) FROM assets a JOIN asset_items ai ON ai.id = a.itemId
          WHERE a.locationId = :loc AND ai.categoryId = c.id) AS currentValue
      FROM asset_category_locations cl
      JOIN asset_categories c ON c.id = cl.categoryId
      WHERE cl.locationId = :loc ${status}
      ORDER BY c.name`,
  },
  {
    key: 'vendors',
    title: 'Vendors',
    description: "The property's asset vendors with contact details and the assets bought from them.",
    dateBasis: null,
    columns: [
      { key: 'vendor', header: 'Vendor' },
      { key: 'category', header: 'Category' },
      { key: 'contactPerson', header: 'Contact Person' },
      { key: 'phone', header: 'Phone' },
      { key: 'email', header: 'Email' },
      { key: 'address', header: 'Address' },
      { key: 'website', header: 'Website' },
      { key: 'taxId', header: 'Tax ID' },
      { key: 'assets', header: 'Assets', type: 'number', total: true },
    ],
    sql: (status) => `
      SELECT v.name AS vendor, c.name AS category, v.contactPerson, v.phone, v.email, v.address, v.website, v.taxId,
        (SELECT COUNT(*) FROM assets a LEFT JOIN asset_items ai ON ai.id = a.itemId
          WHERE a.locationId = :loc AND COALESCE(a.vendorId, ai.vendorId) = v.id) AS assets
      FROM asset_vendor_locations vl
      JOIN asset_vendors v ON v.id = vl.vendorId
      LEFT JOIN asset_categories c ON c.id = v.categoryId
      WHERE vl.locationId = :loc ${status}
      ORDER BY v.name`,
  },
  {
    key: 'items',
    title: 'Items',
    description: "The property's asset items with category, vendor, make and model, and the assets of each.",
    dateBasis: null,
    columns: [
      { key: 'item', header: 'Item' },
      { key: 'category', header: 'Category' },
      { key: 'vendor', header: 'Vendor' },
      { key: 'manufacturer', header: 'Manufacturer' },
      { key: 'model', header: 'Model' },
      { key: 'description', header: 'Description' },
      { key: 'assets', header: 'Assets', type: 'number', total: true },
      { key: 'purchasePrice', header: 'Purchase Price (₹)', type: 'money', total: true },
    ],
    sql: (status) => `
      SELECT ai.name AS item, c.name AS category, v.name AS vendor, ai.manufacturer, ai.model, ai.description,
        (SELECT COUNT(*) FROM assets a WHERE a.itemId = ai.id AND a.locationId = :loc) AS assets,
        (SELECT COALESCE(SUM(a.purchasePrice), 0) FROM assets a WHERE a.itemId = ai.id AND a.locationId = :loc)
          AS purchasePrice
      FROM asset_item_locations il
      JOIN asset_items ai ON ai.id = il.itemId
      LEFT JOIN asset_categories c ON c.id = ai.categoryId
      LEFT JOIN asset_vendors v ON v.id = ai.vendorId
      WHERE il.locationId = :loc ${status}
      ORDER BY c.name, ai.name`,
  },
  {
    key: 'assignments',
    title: 'Assignments',
    description: 'Assets assigned to employees, residents or flats, with dates and return condition.',
    dateBasis: 'Assignments active on any day in the range',
    flat: flatIs(`CASE aa.assigneeType WHEN 'flat' THEN aa.assigneeId
      WHEN 'resident' THEN ${residentFlatSql('aa.assigneeId')} END`),
    filter: { label: 'Assigned To', column: 'aa.assigneeType', options: options('employee', 'resident', 'flat') },
    columns: [
      ...ASSET_COLUMNS,
      { key: 'assigneeType', header: 'Assigned To', humanize: true },
      { key: 'assignee', header: 'Assignee' },
      { key: 'assignedAt', header: 'Assigned At', type: 'datetime' },
      { key: 'assignedBy', header: 'Assigned By' },
      { key: 'expectedReturn', header: 'Expected Return', type: 'date' },
      { key: 'returnedAt', header: 'Returned At', type: 'datetime' },
      { key: 'returnCondition', header: 'Return Condition', humanize: true },
      { key: 'state', header: 'Status' },
      { key: 'notes', header: 'Notes' },
    ],
    sql: (status) => `
      SELECT ${assetSelect}, aa.assigneeType,
        CASE aa.assigneeType
          WHEN 'employee' THEN ${userNameSql('aa.assigneeId')}
          WHEN 'resident' THEN ${residentNameSql('aa.assigneeId')}
          WHEN 'flat' THEN ${unitSql('aa.assigneeId')}
        END AS assignee,
        ${localDateTime('aa.assignedAt')} AS assignedAt, ${userNameSql('aa.assignedBy')} AS assignedBy,
        ${day('aa.expectedReturnDate')} AS expectedReturn, ${localDateTime('aa.returnedAt')} AS returnedAt,
        aa.returnCondition, IF(aa.returnedAt IS NULL, 'Assigned', 'Returned') AS state, aa.notes
      FROM asset_assignments aa
      ${assetJoin('aa')}
      WHERE aa.assignedAt < :toUtc AND (aa.returnedAt IS NULL OR aa.returnedAt >= :fromUtc) ${status}
      ORDER BY aa.assignedAt, a.assetTag`,
  },
  {
    key: 'service-logs',
    title: 'Service Logs',
    description: 'Repairs, preventive and other servicing with vendor, cost, status and next service date.',
    dateBasis: 'Service date',
    filter: { label: 'Status', column: 'sl.completionStatus', options: options('pending', 'completed') },
    columns: [
      { key: 'serviceDate', header: 'Service Date', type: 'date' },
      ...ASSET_COLUMNS,
      { key: 'serviceType', header: 'Service Type', humanize: true },
      { key: 'performedBy', header: 'Performed By' },
      { key: 'vendor', header: 'Vendor' },
      { key: 'cost', header: 'Cost (₹)', type: 'money', total: true },
      { key: 'description', header: 'Description' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'completedDate', header: 'Completed On', type: 'date' },
      { key: 'completionRemarks', header: 'Completion Remarks' },
      { key: 'nextServiceDate', header: 'Next Service', type: 'date' },
    ],
    sql: (status) => `
      SELECT ${day('sl.serviceDate')} AS serviceDate, ${assetSelect}, sl.serviceType, sl.performedBy, v.name AS vendor,
        sl.cost, sl.description, sl.completionStatus AS status, ${day('sl.completedDate')} AS completedDate,
        sl.completionRemarks, ${day('sl.nextServiceDate')} AS nextServiceDate
      FROM asset_service_logs sl
      ${assetJoin('sl')}
      LEFT JOIN asset_vendors v ON v.id = sl.vendorId
      WHERE ${inRange('sl.serviceDate')} ${status}
      ORDER BY sl.serviceDate, a.assetTag`,
  },
  {
    key: 'warranties',
    title: 'Warranties',
    description: 'Every warranty with type, vendor, period, coverage and whether it is still active.',
    dateBasis: null,
    filter: {
      label: 'Warranty Status',
      column: 'x.warrantyStatus',
      options: ['Active', 'Expiring soon', 'Expired'].map((s) => ({ value: s, label: s })),
    },
    columns: [
      ...ASSET_COLUMNS,
      { key: 'warrantyType', header: 'Warranty Type', humanize: true },
      { key: 'vendor', header: 'Vendor' },
      { key: 'startDate', header: 'Start Date', type: 'date' },
      { key: 'endDate', header: 'End Date', type: 'date' },
      { key: 'warrantyStatus', header: 'Warranty Status' },
      { key: 'coverage', header: 'Coverage' },
    ],
    sql: (status) => `
      SELECT x.* FROM (
        SELECT ${assetSelect}, w.warrantyType, v.name AS vendor, ${day('w.warrantyStartDate')} AS startDate,
          ${day('w.warrantyEndDate')} AS endDate, ${expirySql('w.warrantyEndDate')} AS warrantyStatus,
          w.coverageDetails AS coverage, w.warrantyEndDate AS sortKey
        FROM asset_warranties w
        ${assetJoin('w')}
        LEFT JOIN asset_vendors v ON v.id = w.vendorId
      ) x
      WHERE 1 = 1 ${status}
      ORDER BY x.sortKey, x.assetTag`,
  },
  {
    key: 'calibrations',
    title: 'Calibrations',
    description: 'Calibrations with result, certificate, who calibrated and the next due date.',
    dateBasis: 'Calibration date',
    filter: { label: 'Result', column: 'cb.result', options: options('pass', 'fail') },
    columns: [
      { key: 'calibrationDate', header: 'Calibration Date', type: 'date' },
      ...ASSET_COLUMNS,
      { key: 'calibratedBy', header: 'Calibrated By' },
      { key: 'certificateNumber', header: 'Certificate No.' },
      { key: 'result', header: 'Result', humanize: true },
      { key: 'remarks', header: 'Remarks' },
      { key: 'nextCalibrationDate', header: 'Next Calibration', type: 'date' },
    ],
    sql: (status) => `
      SELECT ${day('cb.calibrationDate')} AS calibrationDate, ${assetSelect}, cb.calibratedBy, cb.certificateNumber,
        cb.result, cb.remarks, ${day('cb.nextCalibrationDate')} AS nextCalibrationDate
      FROM asset_calibrations cb
      ${assetJoin('cb')}
      WHERE ${inRange('cb.calibrationDate')} ${status}
      ORDER BY cb.calibrationDate, a.assetTag`,
  },
  {
    key: 'certifications',
    title: 'Certifications',
    description: 'Compliance certificates with type, number, issuing authority, validity and status.',
    dateBasis: null,
    filter: {
      label: 'Status',
      column: 'cc.status',
      options: options('valid', 'expiring_soon', 'expired', 'pending_renewal'),
    },
    columns: [
      ...ASSET_COLUMNS,
      { key: 'certificationType', header: 'Type', humanize: true },
      { key: 'certificateNumber', header: 'Certificate No.' },
      { key: 'issuingAuthority', header: 'Issuing Authority' },
      { key: 'issueDate', header: 'Issue Date', type: 'date' },
      { key: 'expiryDate', header: 'Expiry Date', type: 'date' },
      { key: 'status', header: 'Status', humanize: true },
    ],
    sql: (status) => `
      SELECT ${assetSelect}, cc.certificationType, cc.certificateNumber, cc.issuingAuthority,
        ${day('cc.issueDate')} AS issueDate, ${day('cc.expiryDate')} AS expiryDate, cc.status
      FROM asset_compliance_certifications cc
      ${assetJoin('cc')}
      WHERE 1 = 1 ${status}
      ORDER BY cc.expiryDate, a.assetTag`,
  },
  {
    key: 'inspections',
    title: 'Inspections',
    description: 'Inspections with type, inspector, result, findings, recommendations and next due date.',
    dateBasis: 'Inspection date',
    filter: { label: 'Result', column: 'ci.result', options: options('pass', 'fail') },
    columns: [
      { key: 'inspectionDate', header: 'Inspection Date', type: 'date' },
      ...ASSET_COLUMNS,
      { key: 'inspectionType', header: 'Type', humanize: true },
      { key: 'inspectorName', header: 'Inspector' },
      { key: 'result', header: 'Result', humanize: true },
      { key: 'findings', header: 'Findings' },
      { key: 'recommendations', header: 'Recommendations' },
      { key: 'nextInspectionDate', header: 'Next Inspection', type: 'date' },
    ],
    sql: (status) => `
      SELECT ${day('ci.inspectionDate')} AS inspectionDate, ${assetSelect}, ci.inspectionType, ci.inspectorName,
        ci.result, ci.findings, ci.recommendations, ${day('ci.nextInspectionDate')} AS nextInspectionDate
      FROM asset_compliance_inspections ci
      ${assetJoin('ci')}
      WHERE ${inRange('ci.inspectionDate')} ${status}
      ORDER BY ci.inspectionDate, a.assetTag`,
  },
  {
    key: 'training',
    title: 'Training',
    description: 'Training needed to use each asset, who it is for and how long it stays valid.',
    dateBasis: null,
    filter: { label: 'Required For', column: 'ct.requiredFor', options: options('employee', 'resident', 'all') },
    columns: [
      ...ASSET_COLUMNS,
      { key: 'trainingTitle', header: 'Training' },
      { key: 'requiredFor', header: 'Required For', humanize: true },
      { key: 'validityDays', header: 'Validity (days)', type: 'number' },
      { key: 'notes', header: 'Notes' },
    ],
    sql: (status) => `
      SELECT ${assetSelect}, ct.trainingTitle, ct.requiredFor, ct.validityPeriod AS validityDays, ct.notes
      FROM asset_compliance_training ct
      ${assetJoin('ct')}
      WHERE 1 = 1 ${status}
      ORDER BY a.assetTag, ct.trainingTitle`,
  },
]
