import type { Request, Response } from 'express'
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
      jobCategories: [
        { code: 'FNB_CHEF', name: 'Chef & Kitchen Staff', description: 'Culinary preparation & cooking' },
        { code: 'FNB_SERVICE', name: 'Dining Service Staff', description: 'Table service & dining hall' },
        { code: 'FNB_MGR', name: 'F&B Manager / Supervisor', description: 'Food & Beverage management' },
        { code: 'FNB_DELIVERY', name: 'Meal Delivery Executive', description: 'Resident meal delivery' },
      ],
    },
    {
      code: 'SEC',
      name: 'Gate & Security',
      description: 'Security & Access Control Services',
      jobCategories: [
        { code: 'SEC_GUARD', name: 'Security Guard', description: 'Main gate & perimeter security' },
        { code: 'SEC_SUP', name: 'Security Supervisor', description: 'Shift supervision & emergency response' },
        { code: 'SEC_CCTV', name: 'CCTV / Control Room', description: 'Surveillance & access monitoring' },
      ],
    },
    {
      code: 'HK',
      name: 'Housekeeping',
      description: 'Facility Cleanliness & Sanitation',
      jobCategories: [
        { code: 'HK_CLEANER', name: 'Housekeeper / Cleaner', description: 'Facility cleaning & sanitization' },
        { code: 'HK_SUP', name: 'Housekeeping Supervisor', description: 'Housekeeping operations' },
        { code: 'HK_LAUNDRY', name: 'Linen & Laundry Attendant', description: 'Linen management' },
      ],
    },
    {
      code: 'EVT',
      name: 'Event',
      description: 'Community Events & Activity Management',
      jobCategories: [
        { code: 'EVT_COORD', name: 'Event Coordinator', description: 'Event planning & logistics' },
        { code: 'EVT_TECH', name: 'AV & Event Technician', description: 'Audio/Visual & stage setup' },
        { code: 'EVT_MGR', name: 'Event Manager', description: 'Community activities management' },
      ],
    },
    {
      code: 'ADM',
      name: 'Administration',
      description: 'Administrative & Facility Management',
      jobCategories: [
        { code: 'ADM_EXEC', name: 'Admin Executive', description: 'Office management & administrative support' },
        { code: 'ADM_MGR', name: 'Facility / Admin Manager', description: 'General administration' },
      ],
    },
    {
      code: 'FIN',
      name: 'Finance & Billing',
      description: 'Financial & Accounts Management',
      jobCategories: [
        { code: 'FIN_ACCT', name: 'Accountant', description: 'Accounts & billing management' },
        { code: 'FIN_MGR', name: 'Finance Manager', description: 'Financial oversight' },
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

export async function getAllDepartments(req: Request, res: Response): Promise<void> {
  try {
    // Ensure all standard operational departments with job categories exist
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

      // Default for employee creation / general dropdowns: return all real job categories from DB
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
