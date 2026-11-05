import { OFFSET_MIN } from '../dashboardQuery.service.js'

/**
 * Shared types and SQL pieces for the reports on the Reports page.
 *
 * Every query may use these replacements:
 * - `:loc` the property id
 * - `:from` / `:to` the local (IST) days of the range, inclusive, for DATE columns
 * - `:fromUtc` / `:toUtc` the same range as UTC instants (`:toUtc` exclusive), for DATETIME columns
 * - `:status` and `:f0`, `:f1`, … the optional filter values
 * - `:unit` the chosen flats (`property_units.id` list) and `:allFlats` 1 when no flat is chosen
 * Dates are returned as `YYYY-MM-DD` and date-times as local `YYYY-MM-DD HH:MM:SS` strings.
 */

export type ReportColumnType = 'text' | 'number' | 'money' | 'date' | 'datetime'

export interface ReportColumn {
  key: string
  header: string
  type?: ReportColumnType
  /** Add this column up in the totals row. */
  total?: boolean
  /** Raw enum value (e.g. `IN_PROGRESS`) shown as words (`In Progress`); `codes` only converts all-caps codes. */
  humanize?: boolean | 'codes'
}

export interface ReportFilterOption {
  value: string
  label: string
}

export interface ReportFilter {
  label: string
  column: string
  options: ReportFilterOption[]
}

/** One of a tab's further filters, sent as its own query param `key`. */
export interface ReportExtraFilter {
  /** The query param; not one the reports already use (`from`, `to`, `status`, `section`, `flat`, `page`, `limit`). */
  key: string
  label: string
  column: string
  /** Fixed options, or `optionsSql`: a `SELECT value, label` over the property's own data (`:loc`). */
  options?: ReportFilterOption[]
  optionsSql?: string
}

/** One table of rows: what the preview shows and one Excel sheet holds. */
export interface ReportTable {
  /** What the date range applies to, shown on the page and in the file; null when the range doesn't apply. */
  dateBasis: string | null
  /** The filter sent as `status`. */
  filter?: ReportFilter
  /** Further filters, each sent as its own query param. */
  filters?: ReportExtraFilter[]
  /** A condition true when a row belongs to one of the flats `:unit`; tabs without one can't be filtered by flat. */
  flat?: string
  columns: ReportColumn[]
  /** The SELECT, with `where` (empty, or `AND …` conditions for the filters and flat) placed in its WHERE. */
  sql: (where: string) => string
}

/** An extra tab of a report, e.g. Vitals under Medical. */
export interface ReportSection extends ReportTable {
  key: string
  title: string
  description: string
}

/** `IN_PROGRESS` / `dine_in` / `PendingApproval` → `In Progress` / `Dine In` / `Pending Approval`. */
export const humanize = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * A raw query value as the report shows it, in the Excel file and the preview alike: numbers as numbers,
 * dates as their `YYYY-MM-DD[ HH:MM:SS]` text, enum codes as words.
 */
export function reportValue(column: ReportColumn, raw: unknown): string | number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (column.type === 'number' || column.type === 'money') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : String(raw)
  }
  const text = raw instanceof Date ? raw.toISOString() : String(raw)
  if (column.type === 'date' || column.type === 'datetime') return text
  const convert = column.humanize === true || (column.humanize === 'codes' && /^[A-Z0-9_]+$/.test(text))
  return convert ? humanize(text) : text
}

export const options = (...values: string[]): ReportFilterOption[] =>
  values.map((value) => ({ value, label: humanize(value) }))

/** DATETIME (UTC) column as a local date-time / local day. */
export const localDateTime = (col: string) => `DATE_FORMAT(${col} + INTERVAL ${OFFSET_MIN} MINUTE, '%Y-%m-%d %H:%i:%s')`
export const localDay = (col: string) => `DATE(${col} + INTERVAL ${OFFSET_MIN} MINUTE)`
/** DATE column as text. */
export const ymd = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%d')`
/** DATETIME column within the selected local days. */
export const inRange = (col: string) => `${col} >= :fromUtc AND ${col} < :toUtc`

export const fullName = (alias: string) =>
  `NULLIF(TRIM(CONCAT(COALESCE(${alias}.firstName, ''), ' ', COALESCE(${alias}.lastName, ''))), '')`
export const residentNameSql = (col: string) => `(SELECT ${fullName('rx')} FROM residents rx WHERE rx.id = ${col})`
/** A family member's name with their relation, e.g. `Anita Rao (Spouse)`. */
export const familyNameSql = (col: string) =>
  `(SELECT CONCAT_WS(' ', ${fullName('fx')}, CONCAT('(', NULLIF(TRIM(fx.relation), ''), ')'))
    FROM resident_family_members fx WHERE fx.id = ${col})`
export const unitSql = (col: string) => `(SELECT pux.unit_number FROM property_units pux WHERE pux.id = ${col})`
/**
 * A resident's current flat id. Records made for a family member carry their resident's id too, so this
 * places them in the same flat.
 */
export const residentFlatSql = (col: string) => `(SELECT rux.unitId FROM residents rux WHERE rux.id = ${col})`
/** The flat condition for a row whose flat id is `expr`. */
export const flatIs = (expr: string) => `${expr} IN (:unit)`
/** Minutes after midnight as `09:30 AM`. */
export const clockSql = (col: string) =>
  `IF(${col} IS NULL, NULL, TIME_FORMAT(SEC_TO_TIME((${col} % 1440) * 60), '%h:%i %p'))`

/** A 1/0 column as `Yes` / `No`. */
export const yesNo = (col: string) => `IF(${col} = 1, 'Yes', 'No')`

/** A Status filter on a 1/0 active column. */
export const activeFilter = (column: string) => ({
  label: 'Status',
  column,
  options: [
    { value: '1', label: 'Active' },
    { value: '0', label: 'Inactive' },
  ],
})

/** A DATE period (`start`, `end` with NULL meaning open-ended) that overlaps the selected days. */
export const overlapsRange = (start: string, end: string) => `${start} <= :to AND (${end} IS NULL OR ${end} >= :from)`
