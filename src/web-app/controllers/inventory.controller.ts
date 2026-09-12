import type { Response, NextFunction } from 'express'
import { ForeignKeyConstraintError, UniqueConstraintError } from 'sequelize'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { InventoryError } from '../../services/inventory.service.js'
import { successResponse } from '../../utils/response/index.js'

export const inventoryHandler =
  (action: (req: AuthenticatedRequest) => Promise<unknown>, status = 200) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.status(status).json(successResponse('Inventory request completed', await action(req)))
    } catch (error) {
      if (error instanceof InventoryError) {
        res.status(error.status).json({
          success: false,
          message: error.message,
          errors: error.field ? [{ field: error.field, message: error.message }] : [],
        })
        return
      }
      if (error instanceof UniqueConstraintError || error instanceof ForeignKeyConstraintError) {
        res
          .status(409)
          .json({ success: false, message: 'This change conflicts with existing inventory records or assignments' })
        return
      }
      next(error)
    }
  }
