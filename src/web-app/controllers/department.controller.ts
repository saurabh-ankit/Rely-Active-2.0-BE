import type { Request, Response } from 'express'
import { Department, JobCategory } from '../../models/index.js'

export async function getAllDepartments(_req: Request, res: Response): Promise<void> {
  try {
    const departments = await Department.findAll({
      where: { isActive: true },
      include: [{ model: JobCategory, as: 'jobCategories' }],
      order: [['name', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: departments,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
