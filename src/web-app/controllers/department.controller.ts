import type { Request, Response } from 'express'
import { Department, JobCategory } from '../../models/index.js'

/**
 * Seed or ensure the two primary departments and their job categories exist.
 */
async function ensurePrimaryDepartmentsAndJobCategories() {
  const TARGET_DEPARTMENTS = [
    {
      code: 'RNM',
      name: 'Repair & Maintenance',
      description: 'Repair & Maintenance Services',
      jobCategories: [
        { code: 'RNM_ELEC', name: 'Electrical', description: 'Electrical maintenance & repairs' },
        { code: 'RNM_CARP', name: 'Carpentry', description: 'Carpentry & woodwork maintenance' },
        { code: 'RNM_PLUM', name: 'Plumbing', description: 'Plumbing maintenance & repairs' },
        { code: 'RNM_MISC', name: 'Miscellaneous', description: 'General & miscellaneous repairs' },
      ],
    },
    {
      code: 'CON',
      name: 'Concierge',
      description: 'Concierge & Hospitality Services',
      jobCategories: [
        { code: 'CON_HK', name: 'Housekeeping', description: 'Housekeeping & cleaning services' },
        { code: 'CON_LAUNDRY', name: 'Laundry', description: 'Laundry & linen services' },
        { code: 'CON_SUPPORT', name: 'Customer Support', description: 'Customer support & resident helpdesk' },
        { code: 'CON_TRANS', name: 'Transportation', description: 'Transportation & shuttle services' },
        { code: 'CON_OTHERS', name: 'Others', description: 'Other concierge services' },
      ],
    },
  ]

  for (const deptData of TARGET_DEPARTMENTS) {
    let dept = await Department.findOne({ where: { code: deptData.code } })
    if (!dept) {
      dept = await Department.create({
        code: deptData.code,
        name: deptData.name,
        description: deptData.description,
        isActive: true,
      })
    } else if (dept.name !== deptData.name) {
      dept.name = deptData.name
      await dept.save()
    }

    for (const jcData of deptData.jobCategories) {
      const jc = await JobCategory.findOne({ where: { code: jcData.code } })
      if (!jc) {
        await JobCategory.create({
          departmentId: dept.id,
          code: jcData.code,
          name: jcData.name,
          description: jcData.description,
          isActive: true,
        })
      } else if (jc.departmentId !== dept.id || jc.name !== jcData.name) {
        jc.departmentId = dept.id
        jc.name = jcData.name
        await jc.save()
      }
    }
  }
}

export async function getAllDepartments(_req: Request, res: Response): Promise<void> {
  try {
    // Ensure primary departments and job categories exist
    await ensurePrimaryDepartmentsAndJobCategories()

    const departments = await Department.findAll({
      where: {
        isActive: true,
      },
      include: [{ model: JobCategory, as: 'jobCategories', where: { isActive: true }, required: false }],
      order: [['name', 'ASC']],
    })

    const formattedDepartments = departments.map((d: Department & { jobCategories?: Record<string, unknown>[] }) => {
      const existingJobCats = d.jobCategories || []

      return {
        id: d.id,
        code: d.code,
        name: d.name,
        description: d.description,
        jobCategories: existingJobCats.map((jc: Record<string, unknown>) => ({
          id: jc.id,
          code: jc.code,
          name: jc.name,
          description: jc.description,
        })),
      }
    })

    res.status(200).json({
      success: true,
      data: formattedDepartments,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
