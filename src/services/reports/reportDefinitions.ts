import { userNameSql } from '../dashboardQuery.service.js'
import type { ReportKey } from '../../validations/report.validation.js'
import { ASSET_SECTIONS } from './assetSections.js'
import { DINING_SECTIONS } from './diningSections.js'
import { INVENTORY_SECTIONS, packAmountSql } from './inventorySections.js'
import { MEDICAL_SECTIONS } from './medicalSections.js'
import {
  clockSql,
  familyNameSql,
  flatIs,
  fullName,
  inRange,
  localDateTime,
  localDay,
  options,
  residentFlatSql,
  residentNameSql,
  unitSql,
  yesNo,
  ymd,
  type ReportSection,
  type ReportTable,
} from './reportSql.js'

export { humanize, reportValue } from './reportSql.js'
export type {
  ReportColumn,
  ReportColumnType,
  ReportExtraFilter,
  ReportFilter,
  ReportFilterOption,
  ReportSection,
  ReportTable,
} from './reportSql.js'

/** The reports on the Reports page: one per module, each a table of rows for one property and one Excel sheet. */
export interface ReportDefinition extends ReportTable {
  key: ReportKey
  title: string
  description: string
  /** Set when the report has more tabs: the key, tab label and description of its own table. */
  mainSection?: { key: string; title: string; description: string }
  /** Further tabs, each its own table and Excel file. */
  sections?: ReportSection[]
}

/** The roles / departments / job categories the property's employees have, as filter options. */
const employeeOptions = (table: string, alias: string, column: string) => `
  SELECT DISTINCT ${alias}.id AS value, ${alias}.name AS label
  FROM user_locations ul
  JOIN ${table} ${alias} ON ${alias}.id = ul.${column}
  LEFT JOIN roles rx ON rx.id = ul.roleId
  WHERE ul.locId = :loc AND ul.isDeleted = 0 AND COALESCE(rx.code, '') <> 'SUPER_ADMIN'
  ORDER BY label`

/** An event registration (`er`) for a day in the range. */
const regInRange = `COALESCE(er.registrationDate, ${localDay('er.registeredAt')}, ${localDay('er.createdAt')})
  BETWEEN :from AND :to`

/** A ticket's flat: the one it was raised for, else its resident's. */
const ticketFlat = `COALESCE(t.unitId, ${residentFlatSql('t.residentId')})`

/** The Resident Type column of the Residents report; co-owners count as owners and dependents as family. */
const RESIDENT_TYPES = ['Owner', 'Owner (offsite)', 'Tenant', 'Family member']

export const REPORTS: ReportDefinition[] = [
  {
    key: 'residents',
    title: 'Residents',
    description:
      'Everyone linked to each flat: owners (offsite ones too), co-owners, tenants and family members, with contact details.',
    dateBasis: null,
    filter: { label: 'Status', column: 'x.status', options: options('ACTIVE', 'PENDING', 'INACTIVE', 'MOVED_OUT') },
    filters: [
      {
        key: 'type',
        label: 'Resident Type',
        column: 'x.residentType',
        options: RESIDENT_TYPES.map((type) => ({ value: type, label: type })),
      },
    ],
    flat: flatIs('x.unitId'),
    columns: [
      { key: 'unit', header: 'Flat' },
      { key: 'name', header: 'Name' },
      { key: 'residentType', header: 'Resident Type' },
      { key: 'relation', header: 'Relation' },
      { key: 'residing', header: 'Residing' },
      { key: 'phone', header: 'Phone' },
      { key: 'email', header: 'Email' },
      { key: 'gender', header: 'Gender', humanize: true },
      { key: 'dob', header: 'Date of Birth', type: 'date' },
      { key: 'bloodGroup', header: 'Blood Group' },
      { key: 'careLevel', header: 'Care Level', humanize: true },
      { key: 'emergencyContact', header: 'Emergency Contact' },
      { key: 'moveInDate', header: 'Move-in Date', type: 'date' },
      { key: 'moveOutDate', header: 'Move-out Date', type: 'date' },
      { key: 'rentAmount', header: 'Rent (₹)', type: 'money', total: true },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'createdAt', header: 'Added On', type: 'datetime' },
    ],
    // Family members take the flat, move-in / move-out dates and status of the resident they belong to.
    sql: (where) => `
      SELECT x.* FROM (
        SELECT r.unitId, ${unitSql('r.unitId')} AS unit, ${fullName('r')} AS name,
          CASE
            WHEN r.ownershipType = 'DEPENDENT' THEN 'Family member'
            WHEN r.residentType = 'TENANT' THEN 'Tenant'
            WHEN r.isResiding = 1 THEN 'Owner'
            ELSE 'Owner (offsite)'
          END AS residentType,
          NULL AS relation, ${yesNo('r.isResiding')} AS residing, r.phone, r.email, r.gender, ${ymd('r.dob')} AS dob,
          r.bloodGroup, r.careLevel, r.emergencyContact, ${ymd('r.moveInDate')} AS moveInDate,
          ${ymd('r.moveOutDate')} AS moveOutDate, r.rentAmount, r.status, ${localDateTime('r.createdAt')} AS createdAt,
          ${fullName('r')} AS head, 0 AS isFamily
        FROM residents r
        WHERE r.locId = :loc AND r.isDeleted = 0
        UNION ALL
        SELECT r.unitId, ${unitSql('r.unitId')}, ${fullName('fm')}, 'Family member',
          CONCAT_WS(' of ', NULLIF(TRIM(fm.relation), ''), ${fullName('r')}), ${yesNo('fm.isResiding')}, fm.phone,
          fm.email, fm.gender, ${ymd('fm.dob')}, fm.bloodGroup, NULL, NULL, ${ymd('r.moveInDate')},
          ${ymd('r.moveOutDate')}, NULL, r.status, ${localDateTime('fm.createdAt')}, ${fullName('r')}, 1
        FROM resident_family_members fm
        JOIN residents r ON r.id = fm.residentId
        WHERE r.locId = :loc AND r.isDeleted = 0 AND fm.isDeleted = 0
      ) x
      WHERE 1 = 1 ${where}
      ORDER BY x.unit IS NULL, x.unit, x.head, x.isFamily, x.name`,
  },
  {
    key: 'employees',
    title: 'Employees',
    description: 'Staff at the property with their role, department, contact details and joining date.',
    dateBasis: 'Joining date (date added to the property when there is none)',
    filter: {
      label: 'Status',
      column: "IF(ul.isActive = 1 AND us.isActive = 1, 'ACTIVE', 'INACTIVE')",
      options: options('ACTIVE', 'INACTIVE'),
    },
    filters: [
      { key: 'role', label: 'Role', column: 'ul.roleId', optionsSql: employeeOptions('roles', 'ro', 'roleId') },
      {
        key: 'department',
        label: 'Department',
        column: 'ul.departmentId',
        optionsSql: employeeOptions('departments', 'dp', 'departmentId'),
      },
      {
        key: 'jobCategory',
        label: 'Job Category',
        column: 'ul.jobCategoryId',
        optionsSql: employeeOptions('job_categories', 'jc', 'jobCategoryId'),
      },
    ],
    columns: [
      { key: 'name', header: 'Employee' },
      { key: 'employeeCode', header: 'Employee Code' },
      { key: 'role', header: 'Role' },
      { key: 'department', header: 'Department' },
      { key: 'jobCategory', header: 'Job Category' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' },
      { key: 'gender', header: 'Gender', humanize: true },
      { key: 'dateOfJoining', header: 'Joining Date', type: 'date' },
      { key: 'qualification', header: 'Qualification' },
      { key: 'experience', header: 'Experience' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'createdAt', header: 'Added to Property', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT COALESCE(${fullName('ud')}, us.username, us.email) AS name, ud.employeeCode, ro.name AS role,
        dp.name AS department, jc.name AS jobCategory, us.email, COALESCE(ud.phone, us.phone) AS phone, ud.gender,
        ${ymd('ud.dateOfJoining')} AS dateOfJoining, ud.qualification, ud.experience,
        IF(ul.isActive = 1 AND us.isActive = 1, 'ACTIVE', 'INACTIVE') AS status,
        ${localDateTime('ul.createdAt')} AS createdAt
      FROM user_locations ul
      JOIN users us ON us.id = ul.userId AND us.isDeleted = 0
      LEFT JOIN user_details ud ON ud.userId = us.id
      LEFT JOIN roles ro ON ro.id = ul.roleId
      LEFT JOIN departments dp ON dp.id = ul.departmentId
      LEFT JOIN job_categories jc ON jc.id = ul.jobCategoryId
      WHERE ul.locId = :loc AND ul.isDeleted = 0 AND COALESCE(ro.code, '') <> 'SUPER_ADMIN'
        AND COALESCE(ud.dateOfJoining, ${localDay('ul.createdAt')}) BETWEEN :from AND :to ${status}
      ORDER BY name`,
  },
  {
    key: 'roster',
    title: 'Shift & Roster',
    description: 'Each employee shift day with its timing, attendance status, cover and leave details.',
    dateBasis: 'Shift date',
    filter: {
      label: 'Status',
      column: 'sd.status',
      options: options('upcoming', 'on_duty', 'completed', 'absent', 'covered', 'day_off'),
    },
    columns: [
      { key: 'date', header: 'Date', type: 'date' },
      { key: 'employee', header: 'Employee' },
      { key: 'shift', header: 'Shift' },
      { key: 'shiftTime', header: 'Shift Time' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'coveredBy', header: 'Covered By' },
      { key: 'leaveType', header: 'Leave Type', humanize: true },
      { key: 'notes', header: 'Notes' },
      { key: 'markedBy', header: 'Marked By' },
      { key: 'markedAt', header: 'Marked At', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT ${ymd('sd.date')} AS date, ${userNameSql('sa.employeeId')} AS employee, sh.name AS shift,
        IF(sh.startTime IS NULL, NULL, CONCAT(sh.startTime, ' - ', sh.endTime)) AS shiftTime, sd.status,
        ${userNameSql('sd.coveredByEmployeeId')} AS coveredBy, sd.leaveType,
        NULLIF(TRIM(CONCAT_WS(' ', sd.leaveNote, sd.notes)), '') AS notes,
        ${userNameSql('sd.markedBy')} AS markedBy, ${localDateTime('sd.markedAt')} AS markedAt
      FROM shift_dates sd
      JOIN shift_assignments sa ON sa.id = sd.employeeShiftAssignmentId
      LEFT JOIN shifts sh ON sh.id = sa.shiftId
      WHERE sd.locationId = :loc AND sd.isDeleted = 0 AND sd.date BETWEEN :from AND :to ${status}
      ORDER BY sd.date, employee`,
  },
  {
    key: 'tickets',
    title: 'Tickets',
    description: 'Every ticket raised, its category, status, assignee, resolution time and feedback.',
    dateBasis: 'Date raised',
    flat: flatIs(ticketFlat),
    filter: {
      label: 'Status',
      column: 't.status',
      options: options('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'),
    },
    columns: [
      { key: 'ticketNumber', header: 'Ticket No.' },
      { key: 'title', header: 'Title' },
      { key: 'category', header: 'Category', humanize: 'codes' },
      { key: 'subCategory', header: 'Sub-category', humanize: 'codes' },
      { key: 'priority', header: 'Priority', humanize: true },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'department', header: 'Department' },
      { key: 'unit', header: 'Flat' },
      { key: 'raisedBy', header: 'Raised By' },
      { key: 'assignedTo', header: 'Assigned To' },
      { key: 'raisedAt', header: 'Raised At', type: 'datetime' },
      { key: 'dueDate', header: 'Due By', type: 'datetime' },
      { key: 'resolvedAt', header: 'Resolved At', type: 'datetime' },
      { key: 'closedAt', header: 'Closed At', type: 'datetime' },
      { key: 'resolutionHours', header: 'Resolution Time (hrs)', type: 'number' },
      { key: 'invoiceAmount', header: 'Invoice Amount (₹)', type: 'money', total: true },
      { key: 'rating', header: 'Feedback', humanize: true },
      { key: 'resolutionNotes', header: 'Resolution Notes' },
    ],
    sql: (status) => `
      SELECT t.ticketNumber, t.title, COALESCE(tc.name, t.category) AS category, tsc.name AS subCategory, t.priority,
        t.status, dp.name AS department, ${unitSql(ticketFlat)} AS unit,
        COALESCE(${familyNameSql('t.familyMemberId')}, ${residentNameSql('t.residentId')},
          ${userNameSql('t.raisedByUserId')}) AS raisedBy,
        ${userNameSql('t.assignedToUserId')} AS assignedTo, ${localDateTime('t.createdAt')} AS raisedAt,
        ${localDateTime('t.dueDate')} AS dueDate, ${localDateTime('t.resolvedAt')} AS resolvedAt,
        ${localDateTime('t.closedAt')} AS closedAt,
        IF(t.resolvedAt IS NULL, NULL, ROUND(TIMESTAMPDIFF(MINUTE, t.createdAt, t.resolvedAt) / 60, 1)) AS resolutionHours,
        t.invoiceAmount,
        (SELECT tf.rating FROM ticket_feedbacks tf WHERE tf.ticketId = t.id ORDER BY tf.createdAt DESC LIMIT 1) AS rating,
        t.resolutionNotes
      FROM tickets t
      LEFT JOIN ticket_categories tc ON tc.id = t.categoryId
      LEFT JOIN ticket_sub_categories tsc ON tsc.id = t.subCategoryId
      LEFT JOIN departments dp ON dp.id = t.departmentId
      WHERE t.locId = :loc AND ${inRange('t.createdAt')} ${status}
      ORDER BY t.createdAt`,
  },
  {
    key: 'visitors',
    title: 'Gate & Security',
    description: 'Visitor entries at the gate with who they met, approval and check-in / check-out times.',
    dateBasis: 'Check-in time (entry time when not checked in)',
    flat: flatIs('g.unitId'),
    filter: {
      label: 'Status',
      column: 'g.status',
      options: options('PendingApproval', 'Approved', 'Rejected', 'Inside', 'Completed'),
    },
    columns: [
      { key: 'visitorName', header: 'Visitor' },
      { key: 'visitorPhone', header: 'Phone' },
      { key: 'visitorType', header: 'Visitor Type', humanize: true },
      { key: 'numberOfPeople', header: 'People', type: 'number', total: true },
      { key: 'unit', header: 'Flat' },
      { key: 'personToMeet', header: 'Person to Meet' },
      { key: 'company', header: 'Company' },
      { key: 'vehicleNumber', header: 'Vehicle No.' },
      { key: 'entrySource', header: 'Entry Source', humanize: true },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'approvedBy', header: 'Approved By' },
      { key: 'checkInAt', header: 'Check-in', type: 'datetime' },
      { key: 'checkOutAt', header: 'Check-out', type: 'datetime' },
      { key: 'minutesInside', header: 'Time Inside (mins)', type: 'number' },
      { key: 'notes', header: 'Notes' },
    ],
    sql: (status) => `
      SELECT g.visitorName, g.visitorPhone, g.visitorType, g.numberOfPeople, ${unitSql('g.unitId')} AS unit,
        g.personToMeet, g.company, g.vehicleNumber, g.entrySource, g.status,
        COALESCE(g.approverName, ${userNameSql('g.approvedBy')}) AS approvedBy,
        ${localDateTime('g.clockedInAt')} AS checkInAt, ${localDateTime('g.clockedOutAt')} AS checkOutAt,
        IF(g.clockedInAt IS NULL OR g.clockedOutAt IS NULL, NULL,
          TIMESTAMPDIFF(MINUTE, g.clockedInAt, g.clockedOutAt)) AS minutesInside,
        g.notes
      FROM gate_entries g
      WHERE g.locId = :loc AND ${inRange('COALESCE(g.clockedInAt, g.createdAt)')} ${status}
      ORDER BY COALESCE(g.clockedInAt, g.createdAt)`,
  },
  {
    key: 'inventory',
    title: 'Inventory',
    description: 'Stock transactions, items with stock levels, suppliers and purchase orders.',
    mainSection: {
      key: 'transactions',
      title: 'Transactions',
      description: 'Stock purchases and issues line by line, with quantities, cost, supplier and recipient.',
    },
    sections: INVENTORY_SECTIONS,
    dateBasis: 'Transaction date',
    flat: flatIs(residentFlatSql('tx.residentId')),
    filter: { label: 'Type', column: 'tx.transactionType', options: options('purchase', 'issue') },
    columns: [
      { key: 'date', header: 'Date', type: 'date' },
      { key: 'transactionNumber', header: 'Transaction No.' },
      { key: 'transactionType', header: 'Type', humanize: true },
      { key: 'item', header: 'Item' },
      { key: 'category', header: 'Category' },
      { key: 'pack', header: 'Pack' },
      { key: 'quantity', header: 'Quantity', type: 'number', total: true },
      { key: 'unitCost', header: 'Cost per Package (₹)', type: 'money' },
      { key: 'amount', header: 'Amount (₹)', type: 'money', total: true },
      { key: 'batchNumber', header: 'Batch No.' },
      { key: 'expiryDate', header: 'Expiry Date', type: 'date' },
      { key: 'supplier', header: 'Supplier' },
      { key: 'issuedTo', header: 'Issued To' },
      { key: 'currentStock', header: 'Current Stock', type: 'number' },
      { key: 'notes', header: 'Notes' },
    ],
    sql: (status) => `
      SELECT ${ymd('tx.date')} AS date, tx.transactionNumber, tx.transactionType, COALESCE(it.name, l.itemName) AS item,
        ic.name AS category,
        NULLIF(TRIM(CONCAT_WS(' ', l.packType, IF(l.packQuantity IS NULL, NULL,
          CONCAT('(', l.packQuantity, ' ', COALESCE(l.packUnit, ''), ')')))), '') AS pack,
        l.quantity, l.unitCost, ${packAmountSql('l.quantity', 'l.packQuantity', 'l.unitCost')} AS amount, l.batchNumber,
        ${ymd('l.expiryDate')} AS expiryDate, iv.name AS supplier,
        COALESCE(NULLIF(tx.recipientName, ''), ${residentNameSql('tx.residentId')},
          ${userNameSql('tx.assignedUserId')}) AS issuedTo,
        (SELECT st.quantity FROM inventory_stock st WHERE st.locationId = tx.locationId AND st.itemId = l.itemId LIMIT 1)
          AS currentStock,
        tx.notes
      FROM inventory_stock_transaction_lines l
      JOIN inventory_stock_transactions tx ON tx.id = l.transactionId
      LEFT JOIN inventory_items it ON it.id = l.itemId
      LEFT JOIN inventory_categories ic ON ic.id = it.categoryId
      LEFT JOIN inventory_vendors iv ON iv.id = tx.supplierId
      WHERE tx.locationId = :loc AND tx.date BETWEEN :from AND :to ${status}
      ORDER BY tx.date, tx.transactionNumber, item`,
  },
  {
    key: 'assets',
    title: 'Assets',
    description: 'Assets, categories, vendors, items, assignments, servicing, warranties, calibrations and compliance.',
    mainSection: {
      key: 'assets',
      title: 'Assets',
      description: 'Assets at the property with tag, category, vendor, value, warranty, condition and status.',
    },
    sections: ASSET_SECTIONS,
    dateBasis: 'Date added',
    filter: {
      label: 'Status',
      column: 'a.status',
      options: options('available', 'assigned', 'maintenance', 'retired', 'disposed'),
    },
    columns: [
      { key: 'assetTag', header: 'Asset Tag' },
      { key: 'serialNumber', header: 'Serial No.' },
      { key: 'item', header: 'Asset' },
      { key: 'category', header: 'Category' },
      { key: 'manufacturer', header: 'Manufacturer' },
      { key: 'model', header: 'Model' },
      { key: 'vendor', header: 'Vendor' },
      { key: 'purchaseDate', header: 'Purchase Date', type: 'date' },
      { key: 'purchasePrice', header: 'Purchase Price (₹)', type: 'money', total: true },
      { key: 'currentValue', header: 'Current Value (₹)', type: 'money', total: true },
      { key: 'warrantyEndDate', header: 'Warranty Ends', type: 'date' },
      { key: 'condition', header: 'Condition', humanize: true },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'notes', header: 'Notes' },
      { key: 'createdAt', header: 'Added On', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT a.assetTag, a.serialNumber, ai.name AS item, ac.name AS category, ai.manufacturer, ai.model,
        av.name AS vendor, ${ymd('a.purchaseDate')} AS purchaseDate, a.purchasePrice, a.currentValue,
        ${ymd('a.warrantyEndDate')} AS warrantyEndDate, a.\`condition\` AS \`condition\`, a.status, a.notes,
        ${localDateTime('a.createdAt')} AS createdAt
      FROM assets a
      LEFT JOIN asset_items ai ON ai.id = a.itemId
      LEFT JOIN asset_categories ac ON ac.id = ai.categoryId
      LEFT JOIN asset_vendors av ON av.id = COALESCE(a.vendorId, ai.vendorId)
      WHERE a.locationId = :loc AND ${inRange('a.createdAt')} ${status}
      ORDER BY a.createdAt`,
  },
  {
    key: 'medical',
    title: 'Medical',
    description:
      'Appointments, vitals, medications, lab reports, fluid balance, incidents, doctor notes, care tasks and packages.',
    mainSection: {
      key: 'appointments',
      title: 'Appointments',
      description: 'Doctor appointments with patient, doctor, slot, status, fee and attendance.',
    },
    sections: MEDICAL_SECTIONS,
    dateBasis: 'Appointment date',
    flat: flatIs('rs.unitId'),
    filter: {
      label: 'Status',
      column: 'da.status',
      options: options('PENDING', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'),
    },
    columns: [
      { key: 'date', header: 'Appointment Date', type: 'date' },
      { key: 'slot', header: 'Slot' },
      { key: 'resident', header: 'Resident' },
      { key: 'familyMember', header: 'Family Member' },
      { key: 'unit', header: 'Flat' },
      { key: 'doctor', header: 'Doctor' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'fee', header: 'Fee (₹)', type: 'money', total: true },
      { key: 'bookedAt', header: 'Booked At', type: 'datetime' },
      { key: 'attendedAt', header: 'Attended At', type: 'datetime' },
      { key: 'cancelledAt', header: 'Cancelled At', type: 'datetime' },
      { key: 'cancellationReason', header: 'Cancellation Reason' },
      { key: 'notes', header: 'Notes' },
    ],
    sql: (status) => `
      SELECT ${ymd('da.appointmentDate')} AS date, da.slotTimeRange AS slot, ${fullName('rs')} AS resident,
        ${familyNameSql('da.familyMemberId')} AS familyMember, ${unitSql('rs.unitId')} AS unit,
        ${userNameSql('da.doctorId')} AS doctor, da.status, da.fee,
        ${localDateTime('COALESCE(da.bookedAt, da.createdAt)')} AS bookedAt,
        ${localDateTime('da.attendedAt')} AS attendedAt, ${localDateTime('da.cancelledAt')} AS cancelledAt,
        da.cancellationReason, da.notes
      FROM doctor_appointments da
      LEFT JOIN residents rs ON rs.id = da.residentId
      WHERE da.locationId = :loc AND da.isDeleted = 0 AND da.appointmentDate BETWEEN :from AND :to ${status}
      ORDER BY da.appointmentDate, da.slotTimeRange`,
  },
  {
    key: 'dining',
    title: 'Food & Beverage',
    description: 'Meal orders, resident food packages, food attendance, menu, dishes, package pricing and meal slots.',
    mainSection: {
      key: 'orders',
      title: 'Orders',
      description: 'Meal orders with resident, meal, service type, quantity, amount and delivery status.',
    },
    sections: DINING_SECTIONS,
    dateBasis: 'Order date',
    flat: flatIs('COALESCE(o.unitId, rs.unitId)'),
    filter: {
      label: 'Status',
      column: 'o.orderStatus',
      options: options(
        'placed',
        'accepted',
        'preparing',
        'ready',
        'delivering_to_room',
        'delivered',
        'completed',
        'cancelled',
      ),
    },
    columns: [
      { key: 'date', header: 'Order Date', type: 'date' },
      { key: 'resident', header: 'Resident' },
      { key: 'familyMember', header: 'Family Member' },
      { key: 'unit', header: 'Flat' },
      { key: 'meal', header: 'Meal' },
      { key: 'orderType', header: 'Order Type', humanize: true },
      { key: 'serviceType', header: 'Service', humanize: true },
      { key: 'quantity', header: 'Quantity', type: 'number', total: true },
      { key: 'unitPrice', header: 'Unit Price (₹)', type: 'money' },
      { key: 'deliveryCharge', header: 'Delivery Charge (₹)', type: 'money', total: true },
      { key: 'totalAmount', header: 'Total (₹)', type: 'money', total: true },
      { key: 'packageCovered', header: 'Covered by Package' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'assignedTo', header: 'Assigned To' },
      { key: 'placedAt', header: 'Placed At', type: 'datetime' },
      { key: 'deliveredAt', header: 'Delivered At', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT ${ymd('o.date')} AS date, ${fullName('rs')} AS resident, ${familyNameSql('o.familyMemberId')} AS familyMember,
        ${unitSql('COALESCE(o.unitId, rs.unitId)')} AS unit,
        COALESCE(gms.name,
          (SELECT gm.name FROM fnb_property_meal_slots pm JOIN fnb_global_meal_slots gm ON gm.id = pm.globalMealSlotId
            WHERE pm.id = o.mealSlotId),
          pss.name, gss.name) AS meal,
        o.orderType, o.serviceType, o.quantity, o.unitPrice, o.deliveryCharge, o.totalAmount,
        IF(o.isPackageCovered = 1, 'Yes', 'No') AS packageCovered, o.orderStatus AS status,
        ${userNameSql('o.assignedEmployeeId')} AS assignedTo, ${localDateTime('o.createdAt')} AS placedAt,
        ${localDateTime('o.deliveredAt')} AS deliveredAt
      FROM fnb_resident_orders o
      LEFT JOIN residents rs ON rs.id = o.residentId
      LEFT JOIN fnb_global_meal_slots gms ON gms.id = o.mealSlotId
      LEFT JOIN fnb_property_special_slots pss ON pss.id = o.specialMealSlotId
      LEFT JOIN fnb_global_special_slots gss ON gss.id = o.specialMealSlotId
      WHERE o.locId = :loc AND o.date BETWEEN :from AND :to ${status}
      ORDER BY o.date, o.createdAt`,
  },
  {
    key: 'billing',
    title: 'Billing',
    description: 'Invoices with flat, billing period, tax breakup, amount paid, balance and payment status.',
    dateBasis: 'Invoice date',
    flat: flatIs('i.unitId'),
    filter: {
      label: 'Status',
      column: 'i.status',
      options: options(
        'DRAFT',
        'PENDING',
        'PARTIALLY_PAID',
        'PAID',
        'OVERDUE',
        'CANCELLED',
        'CARRY_FORWARDED',
        'OBSOLETE',
      ),
    },
    columns: [
      { key: 'invoiceNumber', header: 'Invoice No.' },
      { key: 'invoiceDate', header: 'Invoice Date', type: 'date' },
      { key: 'unit', header: 'Flat' },
      { key: 'billTo', header: 'Bill To' },
      { key: 'phone', header: 'Phone' },
      { key: 'periodFrom', header: 'Period From', type: 'date' },
      { key: 'periodTo', header: 'Period To', type: 'date' },
      { key: 'billingMode', header: 'Billing Mode', humanize: true },
      { key: 'subtotal', header: 'Subtotal (₹)', type: 'money', total: true },
      { key: 'discount', header: 'Discount (₹)', type: 'money', total: true },
      { key: 'taxableAmount', header: 'Taxable Amount (₹)', type: 'money', total: true },
      { key: 'cgstAmount', header: 'CGST (₹)', type: 'money', total: true },
      { key: 'sgstAmount', header: 'SGST (₹)', type: 'money', total: true },
      { key: 'total', header: 'Total (₹)', type: 'money', total: true },
      { key: 'paidAmount', header: 'Paid (₹)', type: 'money', total: true },
      { key: 'balance', header: 'Balance (₹)', type: 'money', total: true },
      { key: 'dueDate', header: 'Due Date', type: 'date' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'paymentMethod', header: 'Payment Method', humanize: true },
      { key: 'paymentReference', header: 'Payment Reference' },
    ],
    sql: (status) => `
      SELECT i.invoiceNumber, ${ymd(localDay('i.createdAt'))} AS invoiceDate,
        COALESCE(NULLIF(i.billToUnitNumber, ''), ${unitSql('i.unitId')}) AS unit, i.billToName AS billTo,
        i.billToPhone AS phone, ${ymd('i.startDate')} AS periodFrom, ${ymd('i.endDate')} AS periodTo, i.billingMode,
        i.subtotal, COALESCE(i.discountAmount, i.discount, 0) AS discount, i.taxableAmount, i.cgstAmount,
        i.sgstAmount, i.total, i.paidAmount,
        COALESCE(i.remainingBalance, i.total - COALESCE(i.paidAmount, 0)) AS balance, ${ymd('i.dueDate')} AS dueDate,
        i.status, i.paymentMethod, i.paymentReference
      FROM invoices i
      WHERE i.propertyId = :loc AND i.isDeleted = 0 AND ${inRange('i.createdAt')} ${status}
      ORDER BY i.createdAt, i.invoiceNumber`,
  },
  {
    key: 'events',
    title: 'Events',
    description:
      'Events held with venue, schedule, capacity, and registrations, seats and attendance in the range. With flats chosen, only their registrations count.',
    dateBasis: 'Event date (registrations counted for days in the range)',
    flat: `EXISTS (SELECT 1 FROM event_registrations er
      WHERE er.eventId = e.id AND er.isDeleted = 0 AND ${regInRange} AND ${flatIs(residentFlatSql('er.residentId'))})`,
    filter: { label: 'Event Type', column: 'e.eventType', options: options('regular', 'special') },
    columns: [
      { key: 'title', header: 'Event' },
      { key: 'eventType', header: 'Type', humanize: true },
      { key: 'venue', header: 'Venue' },
      { key: 'startDate', header: 'Starts', type: 'datetime' },
      { key: 'endDate', header: 'Ends', type: 'datetime' },
      { key: 'frequency', header: 'Frequency', humanize: true },
      { key: 'capacity', header: 'Capacity', type: 'number' },
      { key: 'entryFee', header: 'Entry Fee (₹)', type: 'money' },
      { key: 'registrations', header: 'Registrations', type: 'number', total: true },
      { key: 'seats', header: 'Seats Booked', type: 'number', total: true },
      { key: 'attended', header: 'Attended', type: 'number', total: true },
      { key: 'cancelled', header: 'Cancelled', type: 'number', total: true },
      { key: 'status', header: 'Status' },
    ],
    sql: (status) => {
      const regs = (extra: string, value = 'COUNT(*)') => `(SELECT ${value} FROM event_registrations er
        WHERE er.eventId = e.id AND er.isDeleted = 0 ${extra} AND ${regInRange}
          AND (:allFlats = 1 OR ${flatIs(residentFlatSql('er.residentId'))}))`
      return `
      SELECT e.title, e.eventType, ev.name AS venue, ${localDateTime('e.startDate')} AS startDate,
        ${localDateTime('e.endDate')} AS endDate, e.frequencyType AS frequency,
        COALESCE(e.maxCapacity, e.occupancy) AS capacity, e.entryFee,
        ${regs("AND er.status <> 'CANCELLED'")} AS registrations,
        ${regs("AND er.status <> 'CANCELLED'", 'COALESCE(SUM(COALESCE(er.seatCount, 1)), 0)')} AS seats,
        ${regs("AND (er.status = 'ATTENDED' OR er.attendedAt IS NOT NULL)")} AS attended,
        ${regs("AND er.status = 'CANCELLED'")} AS cancelled,
        IF(e.isActive = 1, 'Active', 'Inactive') AS status
      FROM events e
      LEFT JOIN event_venues ev ON ev.id = e.venueId
      WHERE e.locationId = :loc AND e.isDeleted = 0
        AND e.startDate < :toUtc AND COALESCE(e.endDate, e.startDate) >= :fromUtc ${status}
      ORDER BY e.startDate, e.title`
    },
  },
  {
    key: 'amenities',
    title: 'Amenities',
    description: 'Amenity slot bookings with resident, amenity, timing, units booked, charge and status.',
    dateBasis: 'Booking date',
    flat: flatIs('rs.unitId'),
    filter: { label: 'Status', column: 'b.status', options: options('BOOKED', 'CANCELLED') },
    columns: [
      { key: 'date', header: 'Date', type: 'date' },
      { key: 'endDate', header: 'End Date', type: 'date' },
      { key: 'amenity', header: 'Amenity' },
      { key: 'startTime', header: 'Start Time' },
      { key: 'endTime', header: 'End Time' },
      { key: 'resident', header: 'Resident' },
      { key: 'unit', header: 'Flat' },
      { key: 'unitCount', header: 'Units Booked', type: 'number', total: true },
      { key: 'chargeAmount', header: 'Charge (₹)', type: 'money', total: true },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'notes', header: 'Notes' },
      { key: 'bookedAt', header: 'Booked At', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT ${ymd('b.date')} AS date, ${ymd('b.endDate')} AS endDate, am.name AS amenity,
        ${clockSql('b.startMinutes')} AS startTime, ${clockSql('b.endMinutes')} AS endTime, ${fullName('rs')} AS resident,
        ${unitSql('rs.unitId')} AS unit, b.unitCount, b.chargeAmount, b.status, b.notes,
        ${localDateTime('b.createdAt')} AS bookedAt
      FROM amenity_slot_bookings b
      JOIN amenity_slot_configs c ON c.id = b.slotConfigId
      JOIN property_amenities pa ON pa.id = c.propertyAmenityId
      LEFT JOIN amenities am ON am.id = pa.amenityId
      LEFT JOIN residents rs ON rs.id = b.residentId
      WHERE pa.propertyId = :loc AND b.isDeleted = 0 AND b.date BETWEEN :from AND :to ${status}
      ORDER BY b.date, b.startMinutes`,
  },
  {
    key: 'feedback',
    title: 'Feedback',
    description: 'Feedback form responses from residents and employees, with ratings and answers.',
    dateBasis: 'Date the form was sent',
    flat: flatIs(residentFlatSql('fr.residentId')),
    filter: { label: 'Response', column: 'fr.status', options: options('SUBMITTED', 'PENDING') },
    columns: [
      { key: 'form', header: 'Form' },
      { key: 'audience', header: 'Audience', humanize: true },
      { key: 'sentAt', header: 'Sent At', type: 'datetime' },
      { key: 'expiryDate', header: 'Expires', type: 'datetime' },
      { key: 'recipientType', header: 'Recipient Type', humanize: true },
      { key: 'recipient', header: 'Recipient' },
      { key: 'unit', header: 'Flat' },
      { key: 'status', header: 'Response', humanize: true },
      { key: 'submittedAt', header: 'Submitted At', type: 'datetime' },
      { key: 'averageRating', header: 'Average Rating', type: 'number' },
      { key: 'answers', header: 'Answers' },
    ],
    sql: (status) => `
      SELECT f.title AS form, f.audience, ${localDateTime('COALESCE(f.sentAt, f.createdAt)')} AS sentAt,
        ${localDateTime('f.expiryDate')} AS expiryDate, fr.recipientType,
        COALESCE(${residentNameSql('fr.residentId')}, ${userNameSql('fr.userId')}) AS recipient,
        (SELECT ${unitSql('rr.unitId')} FROM residents rr WHERE rr.id = fr.residentId) AS unit, fr.status,
        ${localDateTime('fr.submittedAt')} AS submittedAt,
        (SELECT ROUND(AVG(fa.ratingValue), 1) FROM feedback_answers fa
          WHERE fa.recipientId = fr.id AND fa.ratingValue IS NOT NULL) AS averageRating,
        (SELECT GROUP_CONCAT(CONCAT(fq.questionText, ': ', COALESCE(NULLIF(fa.answerText, ''),
            CAST(fa.ratingValue AS CHAR),
            REPLACE(REPLACE(REPLACE(CAST(fa.selectedOptions AS CHAR), '[', ''), ']', ''), '"', ''), '-'))
          ORDER BY fq.sortOrder SEPARATOR ' | ')
          FROM feedback_answers fa JOIN feedback_questions fq ON fq.id = fa.questionId
          WHERE fa.recipientId = fr.id) AS answers
      FROM feedback_form_recipients fr
      JOIN feedback_forms f ON f.id = fr.formId
      WHERE f.locationId = :loc AND f.isDeleted = 0 AND ${inRange('COALESCE(f.sentAt, f.createdAt)')} ${status}
      ORDER BY COALESCE(f.sentAt, f.createdAt), f.title, recipient`,
  },
]

export const REPORTS_BY_KEY = new Map(REPORTS.map((r) => [r.key, r]))

/** The tabs of a report, its own table first. A report without extra tabs has one. */
export const reportSections = (report: ReportDefinition): ReportSection[] => [
  {
    key: report.mainSection?.key ?? 'main',
    title: report.mainSection?.title ?? report.title,
    description: report.mainSection?.description ?? report.description,
    dateBasis: report.dateBasis,
    ...(report.filter ? { filter: report.filter } : {}),
    ...(report.filters ? { filters: report.filters } : {}),
    ...(report.flat ? { flat: report.flat } : {}),
    columns: report.columns,
    sql: report.sql,
  },
  ...(report.sections ?? []),
]
