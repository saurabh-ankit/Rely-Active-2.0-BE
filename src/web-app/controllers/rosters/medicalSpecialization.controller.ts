import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { MedicalSpecialization } from '../../../models/index.js'

/**
 * Get all active Medical Specializations
 * GET /api/v1/roster/specializations
 */
export async function getSpecializations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const specializations = await MedicalSpecialization.findAll({
      where: { isDeleted: false, isActive: true },
      order: [['name', 'ASC']],
    })

    return res.status(200).json({
      success: true,
      data: specializations,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Create a new Medical Specialization
 * POST /api/v1/roster/specializations
 */
export async function createSpecialization(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { name, code, category, description } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Specialization name is required.',
      })
    }

    const generatedCode = (code as string) || (name as string).toUpperCase().replace(/[^A-Z0-9]/g, '_')

    // Check if code already exists
    const existing = await MedicalSpecialization.findOne({
      where: { code: generatedCode, isDeleted: false },
    })

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Specialization code "${generatedCode}" already exists.`,
      })
    }

    const specialization = await MedicalSpecialization.create({
      name: name as string,
      code: generatedCode,
      category: category || 'ALL',
      description: description || null,
      isActive: true,
      isDeleted: false,
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    return res.status(201).json({
      success: true,
      message: 'Medical specialization created successfully.',
      data: specialization,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Delete a Medical Specialization (Soft Delete)
 * DELETE /api/v1/roster/specializations/:id
 */
export async function deleteSpecialization(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params

    const spec = await MedicalSpecialization.findByPk(id as string)
    if (!spec || spec.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Medical specialization not found.',
      })
    }

    await spec.update({
      isDeleted: true,
      updatedBy: req.user?.id || 'system',
    })

    return res.status(200).json({
      success: true,
      message: 'Medical specialization deleted successfully.',
    })
  } catch (error) {
    next(error)
  }
}
