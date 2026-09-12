import multer from 'multer'
import { z } from 'zod'
import {
  inventoryTemplate,
  importInventoryItems,
  InventoryImportError,
} from '../../services/inventory-import.service.js'
import { receiveInventoryImage, uploadInventoryImage } from '../controllers/inventory-image.controller.js'
import { Router } from 'express'
import { authenticate, type AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate/index.js'
import { AuthorizationService } from '../../services/authorization.service.js'
import { ALLOWED_UNITS_BY_PACKAGE_TYPE, PACKAGE_TYPES, STOCK_UNITS } from '../../enums/inventory.enum.js'
import {
  categoryNameQuerySchema,
  locationThresholdsSchema,
  templateQuerySchema,
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
  categoryNameAvailable,
  saveLocationThresholds,
  setVendorStatus,
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
router.get(
  '/categories/name-availability',
  validateQuery(categoryNameQuerySchema),
  handle((req) => {
    const query = categoryNameQuerySchema.parse(req.query)
    return categoryNameAvailable(query.name, query.excludeCategoryId)
  }),
)
router.get(
  '/categories/:id/template',
  validateParams(inventoryIdSchema),
  validateQuery(templateQuerySchema),
  async (req, res, next) => {
    try {
      const buffer = await inventoryTemplate(String(req.params.id), templateQuerySchema.parse(req.query).rowCount)
      res
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .attachment('inventory-items.xlsx')
        .send(Buffer.from(buffer))
    } catch (error) {
      next(error)
    }
  },
)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single(
  'file',
)
router.post(
  '/categories/:id/import',
  validateParams(inventoryIdSchema),
  (req, res, next) => {
    upload(req, res, (error) => {
      if (error) {
        res.status(400).json({ success: false, message: 'Upload one .xlsx file up to 10 MB' })
        return
      }
      next()
    })
  },
  handle(async (req) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith('.xlsx'))
      throw new InventoryImportError(['Upload an .xlsx file'])
    return importInventoryItems(String(req.params.id), req.file.buffer, req.user!.id)
  }, 201),
)
router.get(
  '/items/:id/thresholds',
  validateParams(inventoryIdSchema),
  handle(async (req) => {
    const item = await getInventoryDetail('items', String(req.params.id))
    return { locations: 'locationThresholds' in item ? item.locationThresholds : [] }
  }),
)
router.put(
  '/items/:id/thresholds',
  validateParams(inventoryIdSchema),
  validateBody(locationThresholdsSchema),
  handle((req) => saveLocationThresholds(String(req.params.id), req.body, req.user!.id)),
)
router.put(
  '/vendors/:id/status',
  validateParams(inventoryIdSchema),
  validateBody(z.object({ isActive: z.boolean() }).strict()),
  handle((req) => setVendorStatus(String(req.params.id), req.body.isActive, req.user!.id)),
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
