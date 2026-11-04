import { QueryTypes } from 'sequelize'
import sequelize from '../config/db/index.js'

/**
 * Shared helpers for the dashboard statistics and analytics endpoints.
 * Series are in local (IST) time; DATETIME columns are stored in UTC.
 */

/** Local time offset: DATETIME columns are stored in UTC. */
export const OFFSET_MIN = Number(process.env.BILLING_TZ_OFFSET_MINUTES ?? 330)
export const TREND_DAYS = 14
export const TREND_MONTHS = 6

export type Row = Record<string, unknown>

export const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
export const round1 = (v: number) => Math.round(v * 10) / 10
export const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0)

/** Local calendar day / month keys. */
export const localNow = () => new Date(Date.now() + OFFSET_MIN * 60_000)
export const dayKey = (d: Date) => d.toISOString().slice(0, 10)
export const daysAgo = (n: number) => dayKey(new Date(localNow().getTime() - n * 86_400_000))
export const daysAhead = (n: number) => dayKey(new Date(localNow().getTime() + n * 86_400_000))
export const lastDays = (n: number) => {
  const today = localNow()
  return Array.from({ length: n }, (_, i) => dayKey(new Date(today.getTime() - (n - 1 - i) * 86_400_000)))
}
export const lastMonths = (n: number) => {
  const now = localNow()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}
/** SQL for a DATETIME column as a local day / month / hour. */
export const localDaySql = (col: string) => `DATE(${col} + INTERVAL ${OFFSET_MIN} MINUTE)`
export const localMonthSql = (col: string) => `DATE_FORMAT(${col} + INTERVAL ${OFFSET_MIN} MINUTE, '%Y-%m')`
export const localHourSql = (col: string) => `HOUR(${col} + INTERVAL ${OFFSET_MIN} MINUTE)`

export const dayMap = (rows: { d: string; n: number }[]) =>
  new Map(rows.map((r) => [String(r.d).slice(0, 10), num(r.n)]))
export const monthMap = (rows: { m: string; n: number }[]) => new Map(rows.map((r) => [String(r.m), num(r.n)]))

/** Display name of a staff user: profile name, else username / email. */
export const userNameSql = (userCol: string) => `(SELECT COALESCE(
    NULLIF(TRIM(CONCAT(COALESCE(ud.firstName, ''), ' ', COALESCE(ud.lastName, ''))), ''), u.username, u.email)
  FROM users u LEFT JOIN user_details ud ON ud.userId = u.id WHERE u.id = ${userCol} LIMIT 1)`

/**
 * Query helpers scoped to one property, or every property when `loc` is null.
 * `at(col)` is `col = :loc` (or no filter); `q` runs a SELECT with `:loc` bound.
 */
export function scopedQuery(loc: string | null) {
  const at = (col: string) => (loc ? `${col} = :loc` : '1=1')
  const q = <T extends Row = Row>(sql: string, extra: Record<string, unknown> = {}) =>
    sequelize.query<T>(sql, { replacements: { loc, ...extra }, type: QueryTypes.SELECT })
  return { at, q }
}
