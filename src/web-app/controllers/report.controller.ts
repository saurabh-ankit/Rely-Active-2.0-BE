import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { localNow, OFFSET_MIN, scopedQuery, userNameSql } from '../../services/dashboardQuery.service.js'
import {
  REPORTS,
  REPORTS_BY_KEY,
  reportSections,
  reportValue,
  type ReportDefinition,
  type ReportExtraFilter,
  type ReportFilter,
  type ReportFilterOption,
  type ReportSection,
} from '../../services/reports/reportDefinitions.js'
import { fullName } from '../../services/reports/reportSql.js'
import { buildReportWorkbook } from '../../services/reports/reportWorkbook.js'
import {
  MAX_RANGE_DAYS,
  PREVIEW_PAGE_SIZES,
  type ExportReportQuery,
  type PreviewReportQuery,
  type ReportKey,
} from '../../validations/report.validation.js'

/** Excel reports for one property. Only Super Admins and Admins may see or download them. */

const REPORT_ROLES = ['SUPER_ADMIN', 'ADMIN']
/** Safety cap on rows in one file. */
const MAX_ROWS = 50_000

type Property = { id: string; name: string }

/** The property's flats, joined as `pu`, by block, floor and position. */
const FLATS_FROM = `FROM property_units pu
  JOIN property_floors pf ON pf.id = pu.floorId
  JOIN property_blocks pb ON pb.id = pf.blockId
  WHERE pb.propertyId = :loc`

/**
 * The property the reports are for, or an error response. Super Admins may use any property;
 * Admins only those they are assigned to or that belong to a company they are assigned in.
 */
async function resolveProperty(req: AuthenticatedRequest, res: Response): Promise<Property | null> {
  const roles = req.user?.roles ?? []
  if (!roles.some((r) => REPORT_ROLES.includes(r))) {
    res.status(403).json({ success: false, message: 'Only a Super Admin or Admin can view reports.' })
    return null
  }
  const locationId = req.params.locationId as string | undefined
  if (!locationId || locationId === 'ALL') {
    res.status(400).json({ success: false, message: 'Select a property to view its reports.' })
    return null
  }
  const { q } = scopedQuery(locationId)
  const [property] = await q<{ id: string; name: string; companyId: string | null }>(
    `SELECT id, property_name AS name, companyId FROM properties WHERE id = :loc AND isDeleted = 0`,
  )
  if (!property) {
    res.status(404).json({ success: false, message: 'Property not found.' })
    return null
  }
  if (!roles.includes('SUPER_ADMIN')) {
    const [access] = await q<{ ok: number }>(
      `SELECT 1 AS ok FROM user_locations ul
      LEFT JOIN properties p ON p.id = ul.locId
      WHERE ul.userId = :userId AND ul.isDeleted = 0
        AND (ul.locId = :loc OR COALESCE(ul.companyId, p.companyId) = :companyId)
      LIMIT 1`,
      { userId: req.user?.id ?? null, companyId: property.companyId },
    )
    if (!access) {
      res.status(403).json({ success: false, message: 'You do not have access to this property.' })
      return null
    }
  }
  return { id: property.id, name: property.name }
}

/** A local day (`YYYY-MM-DD`) at local midnight, as a UTC DATETIME string, `addDays` later. */
const utcAt = (day: string, addDays = 0) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + addDays * 86_400_000 - OFFSET_MIN * 60_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')

const filterInfo = (filter: ReportFilter | undefined) =>
  filter ? { label: filter.label, options: filter.options } : null

const mapAsync = <T, R>(items: readonly T[], fn: (item: T) => Promise<R>) => Promise.all(items.map(fn))

/** A further filter's options: fixed, or read from the property's data. */
async function filterOptions(propertyId: string, filter: ReportExtraFilter): Promise<ReportFilterOption[]> {
  if (filter.options) return filter.options
  if (!filter.optionsSql) return []
  const { q } = scopedQuery(propertyId)
  const rows = await q<{ value: string; label: string | null }>(filter.optionsSql)
  return rows.map((r) => ({ value: r.value, label: r.label ?? r.value }))
}

export async function listReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const property = await resolveProperty(req, res)
    if (!property) return
    const { q } = scopedQuery(property.id)
    /** For the Flat filter: each occupied flat with the residents living there now, so a name finds it too. */
    const flats = await q<{ id: string; label: string; block: string | null; people: string | null }>(
      `SELECT pu.id, pu.unit_number AS label, pb.block_name AS block,
        (SELECT GROUP_CONCAT(${fullName('r')} ORDER BY r.isResiding DESC, r.firstName SEPARATOR ', ')
          FROM residents r WHERE r.unitId = pu.id AND r.isDeleted = 0 AND r.status <> 'MOVED_OUT') AS people
      ${FLATS_FROM} AND pu.isDeleted = 0 AND pf.isDeleted = 0 AND pb.isDeleted = 0
      HAVING people IS NOT NULL
      ORDER BY pb.sort_order, pb.block_name, pf.floor_number, pu.position, pu.unit_number`,
    )
    res.status(200).json({
      success: true,
      data: {
        property,
        maxRangeDays: MAX_RANGE_DAYS,
        flats,
        reports: await mapAsync(REPORTS, async (report) => {
          const sections = await mapAsync(
            reportSections(report),
            async ({ key, title, description, dateBasis, filter, filters = [], flat }) => ({
              key,
              title,
              description,
              dateBasis,
              filter: filterInfo(filter),
              filters: await mapAsync(filters, async (f) => ({
                key: f.key,
                label: f.label,
                options: await filterOptions(property.id, f),
              })),
              /** Whether the tab can be filtered by flat. */
              flatFilter: Boolean(flat),
            }),
          )
          return {
            key: report.key,
            title: report.title,
            description: report.description,
            dateBasis: report.dateBasis,
            filter: sections[0]!.filter,
            filters: sections[0]!.filters,
            flatFilter: sections[0]!.flatFilter,
            /** The report's tabs; empty when it has just one table. */
            sections: sections.length > 1 ? sections : [],
          }
        }),
      },
    })
  } catch (err: unknown) {
    console.error('List reports error:', err)
    const message = err instanceof Error ? err.message : 'Failed to load reports'
    res.status(500).json({ success: false, message })
  }
}

interface PreparedReport {
  definition: ReportDefinition
  /** The tab asked for (the report's own table when it has no tabs). */
  section: ReportSection
  /** Whether the report has more than one tab. */
  tabbed: boolean
  property: Property
  option: ReportFilterOption | undefined
  /** The further filters chosen, with the option picked for each. */
  chosen: { filter: ReportExtraFilter; option: ReportFilterOption }[]
  /** The flats asked for; empty for every flat. */
  flats: { id: string; label: string }[]
  /** The filters and flat as they're described in the file, e.g. `Status: Active · Flat: B-101`. */
  filterText: string | null
  /** The report's SELECT with the filters applied. */
  sql: string
  replacements: Record<string, unknown>
}

/** The report, property, filter and query replacements for an export or preview, or an error response. */
async function prepareReport(req: AuthenticatedRequest, res: Response): Promise<PreparedReport | null> {
  const definition = REPORTS_BY_KEY.get(req.params.report as ReportKey)
  if (!definition) {
    res.status(404).json({ success: false, message: 'Unknown report.' })
    return null
  }
  const query = req.query as unknown as ExportReportQuery & Record<string, string | undefined>
  const { from, to, status, flat: flatIds = [], section: sectionKey } = query
  const sections = reportSections(definition)
  const section = sectionKey ? sections.find((s) => s.key === sectionKey) : sections[0]
  if (!section) {
    res.status(404).json({ success: false, message: `Unknown ${definition.title} tab.` })
    return null
  }
  const property = await resolveProperty(req, res)
  if (!property) return null

  const option = status ? section.filter?.options.find((o) => o.value === status) : undefined
  if (status && !option) {
    res.status(400).json({ success: false, message: `Unknown ${section.filter?.label.toLowerCase() ?? 'filter'}.` })
    return null
  }
  const chosen: PreparedReport['chosen'] = []
  for (const filter of section.filters ?? []) {
    const value = query[filter.key]
    if (!value) continue
    const picked = (await filterOptions(property.id, filter)).find((o) => o.value === value)
    if (!picked) {
      res.status(400).json({ success: false, message: `Unknown ${filter.label.toLowerCase()}.` })
      return null
    }
    chosen.push({ filter, option: picked })
  }
  let flats: PreparedReport['flats'] = []
  if (flatIds.length > 0) {
    if (!section.flat) {
      res.status(400).json({ success: false, message: `The ${section.title} tab can't be filtered by flat.` })
      return null
    }
    const { q } = scopedQuery(property.id)
    flats = await q<{ id: string; label: string }>(
      `SELECT pu.id, pu.unit_number AS label ${FLATS_FROM} AND pu.id IN (:unit)
      ORDER BY pb.sort_order, pb.block_name, pf.floor_number, pu.position, pu.unit_number`,
      { unit: flatIds },
    )
    if (flats.length !== flatIds.length) {
      res.status(404).json({ success: false, message: 'A chosen flat is not in this property.' })
      return null
    }
  }

  const where = [
    option ? `AND ${section.filter!.column} = :status` : '',
    ...chosen.map(({ filter }, i) => `AND ${filter.column} = :f${i}`),
    flats.length > 0 ? `AND ${section.flat}` : '',
  ]
  const filterText = [
    option && `${section.filter!.label}: ${option.label}`,
    ...chosen.map(({ filter, option: picked }) => `${filter.label}: ${picked.label}`),
    flats.length > 0 && `${flats.length === 1 ? 'Flat' : 'Flats'}: ${flats.map((f) => f.label).join(', ')}`,
  ]
  return {
    definition,
    section,
    tabbed: sections.length > 1,
    property,
    option,
    chosen,
    flats,
    filterText: filterText.filter(Boolean).join(' · ') || null,
    sql: section.sql(where.filter(Boolean).join(' ')),
    replacements: {
      from,
      to,
      fromUtc: utcAt(from),
      toUtc: utcAt(to, 1),
      status: option?.value ?? null,
      ...Object.fromEntries(chosen.map(({ option: picked }, i) => [`f${i}`, picked.value])),
      // `IN ()` is invalid SQL, so with no flat chosen `:unit` holds a value no flat has.
      unit: flats.length > 0 ? flats.map((f) => f.id) : [''],
      allFlats: flats.length > 0 ? 0 : 1,
    },
  }
}

/** One page of a report's rows, with the row count and column totals over the whole range. */
export async function previewReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const prepared = await prepareReport(req, res)
    if (!prepared) return
    const { definition, section, property, option, chosen, flats, sql, replacements } = prepared
    const { page, limit } = req.query as unknown as PreviewReportQuery
    const { q } = scopedQuery(property.id)

    const totalColumns = section.columns.filter((c) => c.total)
    const [summary] = await q(
      `SELECT COUNT(*) AS __rows${totalColumns.map((c) => `, SUM(x.\`${c.key}\`) AS \`${c.key}\``).join('')}
      FROM (${sql}) x`,
      replacements,
    )
    const total = Number(summary?.__rows ?? 0)
    const rows =
      total > (page - 1) * limit
        ? await q(`${sql} LIMIT :limit OFFSET :offset`, { ...replacements, limit, offset: (page - 1) * limit })
        : []

    res.status(200).json({
      success: true,
      data: {
        report: { key: definition.key, title: definition.title, description: definition.description },
        section: { key: section.key, title: section.title, description: section.description },
        property,
        dateBasis: section.dateBasis,
        filter: option ? { label: section.filter!.label, value: option.value, optionLabel: option.label } : null,
        filters: chosen.map(({ filter, option: picked }) => ({
          key: filter.key,
          label: filter.label,
          value: picked.value,
          optionLabel: picked.label,
        })),
        flats,
        columns: section.columns.map(({ key, header, type = 'text', total: adds }) => ({
          key,
          header,
          type,
          total: Boolean(adds),
        })),
        rows: rows.map((row) => Object.fromEntries(section.columns.map((c) => [c.key, reportValue(c, row[c.key])]))),
        totals: Object.fromEntries(
          totalColumns.map((c) => [c.key, Math.round(Number(summary?.[c.key] ?? 0) * 100) / 100]),
        ),
        total,
        page,
        limit,
        pageSizes: PREVIEW_PAGE_SIZES,
        /** Rows beyond this are left out of the Excel file. */
        maxExportRows: MAX_ROWS,
      },
    })
  } catch (err: unknown) {
    console.error('Preview report error:', err)
    const message = err instanceof Error ? err.message : 'Failed to load the report preview'
    res.status(500).json({ success: false, message })
  }
}

export async function exportReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const prepared = await prepareReport(req, res)
    if (!prepared) return
    const { definition, section, tabbed, property, flats, filterText, sql, replacements } = prepared
    const { from, to } = req.query as unknown as ExportReportQuery

    const { q } = scopedQuery(property.id)
    const rows = await q(`${sql} LIMIT :limit`, { ...replacements, limit: MAX_ROWS + 1 })
    const truncated = rows.length > MAX_ROWS
    const [me] = await q<{ name: string | null }>(`SELECT ${userNameSql(':userId')} AS name`, {
      userId: req.user?.id ?? null,
    })

    const table = {
      title: tabbed ? `${definition.title} - ${section.title}` : definition.title,
      sheetName: tabbed ? section.title : definition.title,
      dateBasis: section.dateBasis,
      columns: section.columns,
    }
    const workbook = await buildReportWorkbook(table, truncated ? rows.slice(0, MAX_ROWS) : rows, {
      propertyName: property.name,
      from,
      to,
      generatedBy: me?.name || req.user?.email || 'Unknown user',
      generatedAt: localNow(),
      filterText,
      truncatedAt: truncated ? MAX_ROWS : null,
    })

    const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const name = [
      safe(definition.title),
      ...(tabbed ? [safe(section.title)] : []),
      safe(property.name),
      ...(flats.length === 1 ? [`Flat_${safe(flats[0]!.label)}`] : []),
      ...(flats.length > 1 ? [`${flats.length}_Flats`] : []),
    ].join('_')
    const filename = section.dateBasis
      ? `${name}_${from}_to_${to}.xlsx`
      : `${name}_${localNow().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Report-Rows')
    res.setHeader('X-Report-Rows', String(Math.min(rows.length, MAX_ROWS)))
    await workbook.xlsx.write(res)
    res.end()
  } catch (err: unknown) {
    console.error('Export report error:', err)
    if (res.headersSent) {
      res.end()
      return
    }
    const message = err instanceof Error ? err.message : 'Failed to export report'
    res.status(500).json({ success: false, message })
  }
}
