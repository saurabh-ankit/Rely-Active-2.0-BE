import { receiveInventoryImage, uploadInventoryImage } from '../controllers/inventory-image.controller.js'
import { Router } from 'express'
import { authenticate, type AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate/index.js'
import { AuthorizationService } from '../../services/authorization.service.js'
import { ALLOWED_UNITS_BY_PACKAGE_TYPE, PACKAGE_TYPES, STOCK_UNITS } from '../../enums/inventory.enum.js'
import {
  categorySchema,
  vendorSchema,
  itemSchema,
  locationsSchema,
  itemVendorsSchema,
  definitionSchema,
  inventoryIdSchema,
  inventoryFieldIdSchema,
  inventoryListSchema,
} from '../../validations/inventory.validation.js'
import {
  assignLocations,
  deleteDefinition,
  getInventoryDetail,
  listInventory,
  saveDefinition,
  saveItem,
  saveItemVendors,
  saveMaster,
} from '../../services/inventory.service.js'
import { inventoryHandler as handle } from '../controllers/inventory.controller.js'
const router = Router()
router.use(authenticate)
router.use(async (req: AuthenticatedRequest, res, next) => {
  try {
    if (
      !req.user ||
      req.user.residentId ||
      !(await AuthorizationService.getUserAuthorizationContext(req.user.id)).isSuperAdmin
    ) {
      res.status(403).json({ success: false, message: 'Super-admin access is required for inventory global settings' })
      return
    }
    next()
  } catch (error) {
    next(error)
  }
})
router.post('/category-image', receiveInventoryImage, uploadInventoryImage)
router.get(
  '/package-options',
  handle(async () => ({
    packageTypes: PACKAGE_TYPES,
    stockUnits: STOCK_UNITS,
    allowedUnitsByPackageType: ALLOWED_UNITS_BY_PACKAGE_TYPE,
  })),
)
for (const kind of ['categories', 'vendors', 'items'] as const) {
  router.get(
    `/${kind}`,
    validateQuery(inventoryListSchema),
    handle((req) => listInventory(kind, inventoryListSchema.parse(req.query))),
  )
  router.get(
    `/${kind}/:id`,
    validateParams(inventoryIdSchema),
    handle((req) => getInventoryDetail(kind, String(req.params.id))),
  )
  router.put(
    `/${kind}/:id/locations`,
    validateParams(inventoryIdSchema),
    validateBody(locationsSchema),
    handle((req) => assignLocations(kind, String(req.params.id), req.body.locationIds, req.user!.id)),
  )
}
for (const kind of ['categories', 'vendors'] as const) {
  const schema = kind === 'categories' ? categorySchema : vendorSchema
  router.post(
    `/${kind}`,
    validateBody(schema),
    handle((req) => saveMaster(kind, undefined, req.body, req.user!.id), 201),
  )
  router.put(
    `/${kind}/:id`,
    validateParams(inventoryIdSchema),
    validateBody(schema),
    handle((req) => saveMaster(kind, String(req.params.id), req.body, req.user!.id)),
  )
}
router.post(
  '/items',
  validateBody(itemSchema),
  handle((req) => saveItem(undefined, req.body, req.user!.id), 201),
)
router.put(
  '/items/:id',
  validateParams(inventoryIdSchema),
  validateBody(itemSchema),
  handle((req) => saveItem(String(req.params.id), req.body, req.user!.id)),
)
router.put(
  '/items/:id/vendors',
  validateParams(inventoryIdSchema),
  validateBody(itemVendorsSchema),
  handle((req) => saveItemVendors(String(req.params.id), req.body.assignments, req.user!.id)),
)
router.post(
  '/categories/:id/fields',
  validateParams(inventoryIdSchema),
  validateBody(definitionSchema),
  handle((req) => saveDefinition(String(req.params.id), undefined, req.body, req.user!.id), 201),
)
router.put(
  '/categories/:id/fields/:fieldId',
  validateParams(inventoryFieldIdSchema),
  validateBody(definitionSchema),
  handle((req) => saveDefinition(String(req.params.id), String(req.params.fieldId), req.body, req.user!.id)),
)
router.delete(
  '/categories/:id/fields/:fieldId',
  validateParams(inventoryFieldIdSchema),
  handle((req) => deleteDefinition(String(req.params.id), String(req.params.fieldId))),
)
export default router
