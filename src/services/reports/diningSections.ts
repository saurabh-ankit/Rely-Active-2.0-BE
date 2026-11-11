import { userNameSql } from '../dashboardQuery.service.js'
import {
  activeFilter,
  familyNameSql,
  flatIs,
  fullName,
  localDateTime,
  options,
  overlapsRange,
  unitSql,
  ymd,
  yesNo,
  type ReportSection,
} from './reportSql.js'

/** The Food & Beverage report's tabs after Orders: resident packages, attendance, the menu and the catalogues. */

/** A meal slot id (property slot, or a global slot) as its name. */
const mealSlotSql = (col: string) => `COALESCE(
  (SELECT gm.name FROM fnb_property_meal_slots pm JOIN fnb_global_meal_slots gm ON gm.id = pm.globalMealSlotId
    WHERE pm.id = ${col}),
  (SELECT gm.name FROM fnb_global_meal_slots gm WHERE gm.id = ${col}))`

/** A meal slot id as its start time, for ordering. */
const slotStartSql = (col: string) => `COALESCE(
  (SELECT COALESCE(pm.startTime, gm.startTime) FROM fnb_property_meal_slots pm
    JOIN fnb_global_meal_slots gm ON gm.id = pm.globalMealSlotId WHERE pm.id = ${col}),
  (SELECT gm.startTime FROM fnb_global_meal_slots gm WHERE gm.id = ${col}))`

/** `07:30` → `07:30 AM`. */
const clock = (col: string) => `COALESCE(TIME_FORMAT(CAST(${col} AS TIME), '%h:%i %p'), ${col})`

export const DINING_SECTIONS: ReportSection[] = [
  {
    key: 'resident-packages',
    title: 'Resident Packages',
    description: 'Food packages residents are subscribed to, with diet, dining type, period and price.',
    dateBasis: 'Packages active on any day in the range',
    flat: flatIs('rs.unitId'),
    filter: {
      label: 'Status',
      column: 'rp.status',
      options: options('active', 'paused', 'cancelled', 'completed'),
    },
    columns: [
      { key: 'resident', header: 'Resident' },
      { key: 'familyMember', header: 'Family Member' },
      { key: 'unit', header: 'Flat' },
      { key: 'package', header: 'Package' },
      { key: 'dietaryPreference', header: 'Diet', humanize: true },
      { key: 'diningType', header: 'Dining Type', humanize: true },
      { key: 'startDate', header: 'Start Date', type: 'date' },
      { key: 'endDate', header: 'End Date', type: 'date' },
      { key: 'packagePrice', header: 'Package Price (₹)', type: 'money' },
      { key: 'deliveryCharge', header: 'Delivery Charge (₹)', type: 'money', total: true },
      { key: 'totalPrice', header: 'Total (₹)', type: 'money', total: true },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'allergiesNotes', header: 'Allergies / Notes' },
      { key: 'subscribedAt', header: 'Subscribed At', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT ${fullName('rs')} AS resident, ${familyNameSql('rp.familyMemberId')} AS familyMember,
        ${unitSql('rs.unitId')} AS unit, gp.name AS package, rp.dietaryPreference, rp.diningType,
        ${ymd('rp.startDate')} AS startDate, ${ymd('rp.endDate')} AS endDate, pp.price AS packagePrice,
        rp.deliveryCharge, rp.totalPrice, rp.status, rp.allergiesNotes, ${localDateTime('rp.createdAt')} AS subscribedAt
      FROM fnb_resident_packages rp
      JOIN fnb_property_packages pp ON pp.id = rp.propertyPackageId
      LEFT JOIN fnb_global_packages gp ON gp.id = pp.globalPackageId
      LEFT JOIN residents rs ON rs.id = rp.residentId
      WHERE pp.locId = :loc AND ${overlapsRange('rp.startDate', 'rp.endDate')} ${status}
      ORDER BY rp.startDate, resident`,
  },
  {
    key: 'attendance',
    title: 'Food Attendance',
    description: 'Dine-in attendance by meal slot for residents, family members and guests.',
    dateBasis: 'Attendance date',
    flat: flatIs('COALESCE(fa.unit_id, rs.unitId)'),
    filter: { label: 'Status', column: 'fa.status', options: options('attended', 'absent', 'opted_out') },
    columns: [
      { key: 'date', header: 'Date', type: 'date' },
      { key: 'mealSlot', header: 'Meal Slot' },
      { key: 'name', header: 'Resident / Guest' },
      { key: 'familyMember', header: 'Family Member' },
      { key: 'unit', header: 'Flat' },
      { key: 'guest', header: 'Guest' },
      { key: 'guestCount', header: 'Guests', type: 'number', total: true },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'markedLate', header: 'Marked Late' },
      { key: 'remarks', header: 'Remarks' },
      { key: 'markedBy', header: 'Marked By' },
      { key: 'markedAt', header: 'Marked At', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT ${ymd('fa.date')} AS date, ${mealSlotSql('fa.meal_slot_id')} AS mealSlot,
        IF(fa.is_guest = 1, fa.guest_name, ${fullName('rs')}) AS name, ${familyNameSql('fa.family_member_id')} AS familyMember,
        ${unitSql('COALESCE(fa.unit_id, rs.unitId)')} AS unit, ${yesNo('fa.is_guest')} AS guest,
        IF(fa.is_guest = 1, fa.guest_count, NULL) AS guestCount, fa.status, ${yesNo('fa.marked_late')} AS markedLate,
        fa.remarks, ${userNameSql('fa.created_by')} AS markedBy, ${localDateTime('fa.created_at')} AS markedAt
      FROM fnb_food_attendances fa
      LEFT JOIN residents rs ON rs.id = fa.resident_id
      WHERE fa.loc_id = :loc AND fa.date BETWEEN :from AND :to ${status}
      ORDER BY fa.date, ${slotStartSql('fa.meal_slot_id')}, unit, name`,
  },
  {
    key: 'menu',
    title: 'Menu',
    description: 'The planned menu for each day: meal slot, dish, diet and extra price.',
    dateBasis: 'Menu date (weekly items repeat on each matching day; date-specific items replace them)',
    filter: { label: 'Menu Status', column: 'fm.status', options: options('draft', 'published', 'archived') },
    columns: [
      { key: 'date', header: 'Date', type: 'date' },
      { key: 'day', header: 'Day' },
      { key: 'mealSlot', header: 'Meal Slot', humanize: true },
      { key: 'dish', header: 'Dish' },
      { key: 'category', header: 'Category', humanize: true },
      { key: 'dietaryType', header: 'Diet', humanize: true },
      { key: 'optional', header: 'Optional' },
      { key: 'extraPrice', header: 'Extra Price (₹)', type: 'money' },
      { key: 'planType', header: 'Planned As' },
      { key: 'notes', header: 'Notes' },
      { key: 'menu', header: 'Menu' },
      { key: 'menuStatus', header: 'Menu Status', humanize: true },
    ],
    sql: (status) => `
      WITH RECURSIVE days (d) AS (
        SELECT CAST(:from AS DATE) UNION ALL SELECT d + INTERVAL 1 DAY FROM days WHERE d < :to
      )
      SELECT ${ymd('days.d')} AS date, DAYNAME(days.d) AS day, COALESCE(${mealSlotSql('mi.mealSlotId')}, mi.mealSlot) AS mealSlot,
        dh.name AS dish, dh.category, dh.dietaryType, ${yesNo('mi.isOptional')} AS optional, mi.extraPrice,
        IF(mi.date IS NULL, 'Weekly', 'This date only') AS planType, mi.notes, fm.title AS menu, fm.status AS menuStatus
      FROM days
      JOIN fnb_menu_items mi ON mi.locId = :loc
        AND (mi.date = days.d
          OR (mi.date IS NULL AND LOWER(mi.dayOfWeek) = LOWER(DAYNAME(days.d))
            AND NOT EXISTS (SELECT 1 FROM fnb_menu_items o
              WHERE o.menuId = mi.menuId AND o.date = days.d AND o.mealSlotId <=> mi.mealSlotId)))
      LEFT JOIN fnb_menus fm ON fm.id = mi.menuId
      LEFT JOIN fnb_dishes dh ON dh.id = mi.dishId
      WHERE 1 = 1 ${status}
      ORDER BY days.d, ${slotStartSql('mi.mealSlotId')}, mealSlot, dish`,
  },
  {
    key: 'dishes',
    title: 'Dish Catalogue',
    description: 'Dishes offered at this property with category, diet, base and property price.',
    dateBasis: null,
    filter: {
      label: 'Availability',
      column: 'pd.isAvailable',
      options: [
        { value: '1', label: 'Available' },
        { value: '0', label: 'Not available' },
      ],
    },
    columns: [
      { key: 'dish', header: 'Dish' },
      { key: 'category', header: 'Category', humanize: true },
      { key: 'dietaryType', header: 'Diet', humanize: true },
      { key: 'description', header: 'Description' },
      { key: 'basePrice', header: 'Base Price (₹)', type: 'money' },
      { key: 'price', header: 'Property Price (₹)', type: 'money' },
      { key: 'available', header: 'Available' },
      { key: 'addedAt', header: 'Added On', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT dh.name AS dish, dh.category, dh.dietaryType, dh.description, dh.basePrice, pd.price,
        ${yesNo('pd.isAvailable')} AS available, ${localDateTime('pd.createdAt')} AS addedAt
      FROM fnb_property_dishes pd
      JOIN fnb_dishes dh ON dh.id = pd.dishId AND dh.isDeleted = 0
      WHERE pd.locId = :loc ${status}
      ORDER BY dh.category, dh.name`,
  },
  {
    key: 'packages',
    title: 'Packages & Pricing',
    description: 'Food packages offered at this property with diet, included meals and price.',
    dateBasis: null,
    filter: activeFilter('pp.isActive'),
    columns: [
      { key: 'package', header: 'Package' },
      { key: 'code', header: 'Code' },
      { key: 'dietaryType', header: 'Diet', humanize: true },
      { key: 'meals', header: 'Included Meals' },
      { key: 'description', header: 'Description' },
      { key: 'price', header: 'Price (₹)', type: 'money' },
      { key: 'activeResidents', header: 'Active Subscribers', type: 'number', total: true },
      { key: 'status', header: 'Status' },
    ],
    sql: (status) => `
      SELECT gp.name AS package, gp.code, gp.dietaryType,
        (SELECT GROUP_CONCAT(gm.name ORDER BY gm.startTime SEPARATOR ', ') FROM fnb_global_meal_slots gm
          WHERE JSON_CONTAINS(gp.includedMealSlots, JSON_QUOTE(gm.id))) AS meals,
        gp.description, pp.price,
        (SELECT COUNT(*) FROM fnb_resident_packages rp WHERE rp.propertyPackageId = pp.id AND rp.status = 'active')
          AS activeResidents,
        IF(pp.isActive = 1, 'Active', 'Inactive') AS status
      FROM fnb_property_packages pp
      LEFT JOIN fnb_global_packages gp ON gp.id = pp.globalPackageId
      WHERE pp.locId = :loc ${status}
      ORDER BY gp.name`,
  },
  {
    key: 'meal-slots',
    title: 'Meal Slots & Timings',
    description: "This property's meal slots with timings and price.",
    dateBasis: null,
    filter: activeFilter('pm.isActive'),
    columns: [
      { key: 'mealSlot', header: 'Meal Slot', humanize: true },
      { key: 'startTime', header: 'Starts' },
      { key: 'endTime', header: 'Ends' },
      { key: 'price', header: 'Price (₹)', type: 'money' },
      { key: 'description', header: 'Description' },
      { key: 'status', header: 'Status' },
    ],
    sql: (status) => `
      SELECT gm.name AS mealSlot, ${clock('COALESCE(pm.startTime, gm.startTime)')} AS startTime,
        ${clock('COALESCE(pm.endTime, gm.endTime)')} AS endTime, COALESCE(pm.price, gm.price) AS price, gm.description,
        IF(pm.isActive = 1, 'Active', 'Inactive') AS status
      FROM fnb_property_meal_slots pm
      JOIN fnb_global_meal_slots gm ON gm.id = pm.globalMealSlotId
      WHERE pm.locId = :loc ${status}
      ORDER BY COALESCE(pm.startTime, gm.startTime)`,
  },
]
