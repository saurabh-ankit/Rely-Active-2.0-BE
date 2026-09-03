import type { Request, Response } from 'express'
import { Op } from 'sequelize'
import { Department, JobCategory } from '../../models/index.js'

/**
 * Seed or ensure standard operational departments and their job categories exist.
 */
async function ensureStandardDepartmentsAndJobCategories() {
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
    {
      code: 'FNB',
      name: 'Food & Beverage',
      description: 'Food, Dining & Culinary Services',
      jobCategories: [{ code: 'FNB_OPS', name: 'F&B Operations', description: 'Food & Beverage Operations' }],
    },
    {
      code: 'SEC',
      name: 'Gate & Security',
      description: 'Security & Access Control Services',
      jobCategories: [
        { code: 'SEC_VISITOR', name: 'Visitor Management', description: 'Visitor management & gate entry' },
      ],
    },
    {
      code: 'HK',
      name: 'Housekeeping',
      description: 'Facility Cleanliness & Sanitation',
      jobCategories: [{ code: 'HK_OPS', name: 'Housekeeping Operations', description: 'Housekeeping Operations' }],
    },
    {
      code: 'EVT',
      name: 'Event',
      description: 'Community Events & Activity Management',
      jobCategories: [{ code: 'EVT_OPS', name: 'Event Operations', description: 'Event Operations' }],
    },
    {
      code: 'MED',
      name: 'Medical',
      description: 'Medical & Healthcare Services',
      jobCategories: [
        { code: 'MED_INHOUSE', name: 'Inhouse', description: 'In-house Medical Staff' },
        { code: 'MED_VISITING', name: 'Visiting', description: 'Visiting Medical Staff' },
      ],
    },
  ]

  // Find obsolete departments (NUR, DOC, ADM, ATT, FIN)
  const obsoleteDepts = await Department.findAll({ where: { code: ['NUR', 'DOC', 'ADM', 'ATT', 'FIN'] } })
  const obsoleteDeptIds = obsoleteDepts.map((d) => d.id)

  const OBSOLETE_JOB_CAT_NAMES = [
    'Civil Maintenance',
    'General Maintenance',
    'HVAC',
    'Biomedical Equipment',
    'Front Desk',
    'Resident Services',
    'Guest Services',
    'Event Planning',
    'Community Activities',
    'Recreation',
    'Entertainment',
    'Catering',
    'Nutrition & Dietary',
    'Food Production',
    'Food Service',
    'Kitchen Operations',
    'Stewarding',
    'Chef & Kitchen Staff',
    'Dining Service Staff',
    'F&B Manager / Supervisor',
    'Meal Delivery Executive',
    'Cleaning Services',
    'Room Attendant',
    'Laundry Services',
    'Waste Management',
    'Housekeeper / Cleaner',
    'Housekeeping Supervisor',
    'Linen & Laundry Attendant',
  ]

  // Hard delete obsolete job categories (including any under MED, NUR, DOC, ADM, ATT, FIN)
  await JobCategory.destroy({
    where: {
      [Op.or]: [
        { name: { [Op.in]: OBSOLETE_JOB_CAT_NAMES } },
        ...(obsoleteDeptIds.length > 0 ? [{ departmentId: { [Op.in]: obsoleteDeptIds } }] : []),
      ],
    },
  })

  // Hard delete obsolete departments (NUR, DOC, ADM, ATT, FIN)
  await Department.destroy({
    where: { code: ['NUR', 'DOC', 'ADM', 'ATT', 'FIN'] },
  })

  for (const deptData of TARGET_DEPARTMENTS) {
    let dept = await Department.findOne({ where: { code: deptData.code } })
    if (!dept) {
      dept = await Department.create({
        code: deptData.code,
        name: deptData.name,
        description: deptData.description,
        isActive: true,
      })
    } else if (dept.name !== deptData.name || !dept.isActive) {
      dept.name = deptData.name
      dept.isActive = true
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
      } else if (jc.departmentId !== dept.id || jc.name !== jcData.name || !jc.isActive) {
        jc.departmentId = dept.id
        jc.name = jcData.name
        jc.isActive = true
        await jc.save()
      }
    }

    // Strictly clean up obsolete job categories for Gate & Security in DB so ONLY Visitor Management is kept
    if (deptData.code === 'SEC') {
      await JobCategory.destroy({
        where: {
          departmentId: dept.id,
          code: { [Op.ne]: 'SEC_VISITOR' },
          name: { [Op.ne]: 'Visitor Management' },
        },
      })
    }

    // Strictly clean up obsolete job categories for Event in DB so ONLY Event Operations is kept
    if (deptData.code === 'EVT') {
      await JobCategory.destroy({
        where: {
          departmentId: dept.id,
          code: { [Op.ne]: 'EVT_OPS' },
          name: { [Op.ne]: 'Event Operations' },
        },
      })
    }

    // Strictly clean up obsolete job categories for Food & Beverage in DB so ONLY F&B Operations is kept
    if (deptData.code === 'FNB') {
      await JobCategory.destroy({
        where: {
          departmentId: dept.id,
          code: { [Op.ne]: 'FNB_OPS' },
          name: { [Op.ne]: 'F&B Operations' },
        },
      })
    }

    // Strictly clean up obsolete job categories for Housekeeping in DB so ONLY Housekeeping Operations is kept
    if (deptData.code === 'HK') {
      await JobCategory.destroy({
        where: {
          departmentId: dept.id,
          code: { [Op.ne]: 'HK_OPS' },
          name: { [Op.ne]: 'Housekeeping Operations' },
        },
      })
    }
  }
}

export async function getAllDepartments(req: Request, res: Response): Promise<void> {
  try {
    // Ensure standard operational departments exist and clean up Gate & Security job categories
    await ensureStandardDepartmentsAndJobCategories()

    const isTicketsFlow = req.query.for === 'tickets' || req.query.ticketsOnly === 'true'

    const whereCondition: Record<string, unknown> = {
      isActive: true,
    }

    if (isTicketsFlow) {
      whereCondition.code = ['RNM', 'CON']
    }

    const departments = await Department.findAll({
      where: whereCondition,
      include: [
        {
          model: JobCategory,
          as: 'jobCategories',
          where: { isActive: true },
          required: false,
        },
      ],
      order: [['name', 'ASC']],
    })

    const RNM_CATS = ['Electrical', 'Carpentry', 'Plumbing', 'Miscellaneous']
    const CON_CATS = ['Housekeeping', 'Laundry', 'Customer Support', 'Transportation', 'Others']

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedDepartments = departments.map((d: any) => {
      const existingJobCats = d.jobCategories || []

      if (isTicketsFlow && (d.code === 'RNM' || d.code === 'CON')) {
        const isRNM = d.code === 'RNM'
        const targetCats = isRNM ? RNM_CATS : CON_CATS

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
      }

      // Gate & Security (SEC): Strictly return ONLY Visitor Management
      if (d.code === 'SEC') {
        const visitorCat = existingJobCats.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (j: any) =>
            String(j.code || '').toUpperCase() === 'SEC_VISITOR' ||
            String(j.name || '').toLowerCase() === 'visitor management',
        )

        return {
          id: d.id,
          code: d.code,
          name: d.name,
          description: d.description,
          jobCategories: [
            {
              id: visitorCat?.id || 'jc-sec-visitor',
              code: visitorCat?.code || 'SEC_VISITOR',
              name: 'Visitor Management',
              description: visitorCat?.description || 'Visitor management & gate entry',
            },
          ],
        }
      }

      // Default for employee creation / general dropdowns: return all active job categories from DB
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        description: d.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jobCategories: existingJobCats.map((j: any) => ({
          id: j.id,
          code: j.code,
          name: j.name,
          description: j.description || j.name,
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
