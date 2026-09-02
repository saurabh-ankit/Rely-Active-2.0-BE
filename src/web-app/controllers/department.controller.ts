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
    // Ensure Repair & Maintenance and Concierge with job categories exist
    await ensurePrimaryDepartmentsAndJobCategories()

    const departments = await Department.findAll({
      where: {
        code: ['RNM', 'CON'],
        isActive: true,
      },
      include: [{ model: JobCategory, as: 'jobCategories' }],
      order: [['name', 'ASC']],
    })

    const RNM_CATS = ['Electrical', 'Carpentry', 'Plumbing', 'Miscellaneous']
    const CON_CATS = ['Housekeeping', 'Laundry', 'Customer Support', 'Transportation', 'Others']

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedDepartments = departments.map((d: any) => {
      const isRNM = d.code === 'RNM'
      const targetCats = isRNM ? RNM_CATS : CON_CATS
      const existingJobCats = d.jobCategories || []

      const filteredJobCats = targetCats.map((catName) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matched = existingJobCats.find((j: any) => String(j.name || '').toLowerCase() === catName.toLowerCase())
        return {
          id: matched?.id || `jc-${catName.toLowerCase()}`,
          code: matched?.code || `${String(d.code)}_${catName.substring(0, 4).toUpperCase()}`,
          name: catName,
          description: matched?.description || catName,
        }
      })

      return {
        id: d.id,
        code: d.code,
        name: d.name,
        description: d.description,
        jobCategories: filteredJobCats,
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
