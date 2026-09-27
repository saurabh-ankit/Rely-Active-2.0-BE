import { QueryTypes, type QueryInterface } from 'sequelize'

/**
 * Tickets raised from the resident app before department resolution existed
 * were stored with `departmentId` NULL. The L3 staff app only lists a ticket
 * whose department matches the staff member's, so those tickets can be
 * assigned in the web admin but never appear for the assignee.
 *
 * Their department is recoverable: the title carries it ("Concierge - …",
 * "Repair & Maintenance - …") and `category` holds the job category name.
 */

const DEPARTMENT_RULES: {
  code: string
  titlePrefixes: string[]
  categoryPrefixes: string[]
  categories: string[]
}[] = [
  {
    code: 'RNM',
    titlePrefixes: ['Repair & Maintenance', 'Common Area - Repair & Maintenance'],
    // Common-area tickets store the department in `category`, not the title.
    categoryPrefixes: ['Common Area - Repair & Maintenance'],
    categories: ['Electrical', 'Plumbing', 'Carpentry', 'Miscellaneous'],
  },
  {
    code: 'CON',
    titlePrefixes: ['Concierge', 'Common Area - Concierge'],
    categoryPrefixes: ['Common Area - Concierge'],
    categories: ['Housekeeping', 'Laundry', 'Customer Support', 'Transportation', 'Others'],
  },
]

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tables = await queryInterface.showAllTables()
  const tableNames = tables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )
  if (!tableNames.includes('tickets') || !tableNames.includes('departments')) return

  for (const rule of DEPARTMENT_RULES) {
    const departments = (await queryInterface.sequelize.query('SELECT id FROM departments WHERE code = :code LIMIT 1', {
      replacements: { code: rule.code },
      type: QueryTypes.SELECT,
    })) as { id: string }[]

    const departmentId = departments[0]?.id
    if (!departmentId) continue

    // Match on the title prefix first, then on a known job category name.
    const titleClauses = rule.titlePrefixes.map((_, i) => `title LIKE :prefix${i}`).join(' OR ')
    const categoryClauses = rule.categoryPrefixes.map((_, i) => `category LIKE :catPrefix${i}`).join(' OR ')
    const replacements: Record<string, unknown> = { departmentId, categories: rule.categories }
    rule.titlePrefixes.forEach((prefix, i) => {
      replacements[`prefix${i}`] = `${prefix}%`
    })
    rule.categoryPrefixes.forEach((prefix, i) => {
      replacements[`catPrefix${i}`] = `${prefix}%`
    })

    await queryInterface.sequelize.query(
      `UPDATE tickets
         SET departmentId = :departmentId
       WHERE departmentId IS NULL
         AND ((${titleClauses}) OR (${categoryClauses}) OR category IN (:categories))`,
      { replacements },
    )
  }

  if (!tableNames.includes('job_categories')) return

  // With a department in place, the job category follows from the stored name.
  await queryInterface.sequelize.query(
    `UPDATE tickets t
       JOIN job_categories j
         ON j.name = t.category
        AND j.departmentId = t.departmentId
        SET t.jobCategoryId = j.id
      WHERE t.jobCategoryId IS NULL
        AND t.departmentId IS NOT NULL`,
  )
}

export async function down(): Promise<void> {
  // A data backfill: the previous NULLs carry no information worth restoring.
}
