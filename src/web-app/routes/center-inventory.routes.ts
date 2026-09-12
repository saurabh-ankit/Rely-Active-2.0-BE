import { Router } from 'express'
import { z } from 'zod'
import { authenticate, type AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate/index.js'
import { inventoryHandler as handle } from '../controllers/inventory.controller.js'
import { requireInventoryAccess, type InventoryAction } from '../../services/center-inventory-access.service.js'
import { InventoryError } from '../../services/inventory.service.js'
import * as service from '../../services/center-inventory.service.js'
import {
  centerScopeSchema,
  centerParamsSchema,
  centerListSchema,
  purchaseOrderSchema,
  receiptSchema,
  thresholdSchema,
  suppliersSchema,
  WHOLE_PACKAGE_TYPES,
  assignmentSchema,
  recipientQuerySchema,
} from '../../validations/center-inventory.validation.js'
import { vendorSchema, itemSchema } from '../../validations/inventory.validation.js'
import { PACKAGE_TYPES, STOCK_UNITS, ALLOWED_UNITS_BY_PACKAGE_TYPE } from '../../enums/inventory.enum.js'
const router = Router()
router.use(authenticate)
const scope = (req: AuthenticatedRequest) => String(req.params.locationId)
const id = (req: AuthenticatedRequest) => String(req.params.id)
const access = (action: InventoryAction) =>
  handle(async (req) => {
    if (!req.user || req.user.residentId) throw new InventoryError(403, 'Staff inventory access is required')
    return requireInventoryAccess(req.user.id, scope(req), action)
  })
// Each handler checks access itself so the response is sent only once.
const run = (
  action: InventoryAction,
  fn: (req: AuthenticatedRequest, permissions: Awaited<ReturnType<typeof requireInventoryAccess>>) => Promise<unknown>,
  status = 200,
) =>
  handle(async (req) => {
    if (!req.user || req.user.residentId) throw new InventoryError(403, 'Staff inventory access is required')
    const permissions = await requireInventoryAccess(req.user.id, scope(req), action)
    return fn(req, permissions)
  }, status)
router.get('/:locationId/access', validateParams(centerScopeSchema), access('view'))
router.get(
  '/:locationId/package-options',
  validateParams(centerScopeSchema),
  run('view', async () => ({
    packageTypes: PACKAGE_TYPES,
    stockUnits: STOCK_UNITS,
    allowedUnitsByPackageType: ALLOWED_UNITS_BY_PACKAGE_TYPE,
    wholePackageTypes: WHOLE_PACKAGE_TYPES,
  })),
)
for (const [path, fn] of Object.entries({
  categories: service.centerCategories,
  items: service.centerItems,
  suppliers: service.centerSuppliers,
  stats: service.centerStats,
  'purchase-orders': service.listPurchaseOrders,
  transactions: service.listStockTransactions,
})) {
  router.get(
    `/:locationId/${path}`,
    validateParams(centerScopeSchema),
    validateQuery(centerListSchema),
    run('view', (req) => fn(scope(req), centerListSchema.parse(req.query))),
  )
}
router.get(
  '/:locationId/categories/:id',
  validateParams(centerParamsSchema),
  run('view', (req) => service.centerCategory(scope(req), id(req))),
)
router.get(
  '/:locationId/items/:id',
  validateParams(centerParamsSchema),
  run('view', (req) => service.centerItem(scope(req), id(req), centerListSchema.parse({}))),
)
router.put(
  '/:locationId/items/:id/thresholds',
  validateParams(centerParamsSchema),
  validateBody(thresholdSchema),
  run('update', (req) =>
    service.setCenterThresholds(scope(req), id(req), thresholdSchema.parse(req.body), req.user!.id),
  ),
)
router.put(
  '/:locationId/items/:id/suppliers',
  validateParams(centerParamsSchema),
  validateBody(suppliersSchema),
  run('update', (req) =>
    service.setCenterSuppliers(scope(req), id(req), suppliersSchema.parse(req.body).supplierIds, req.user!.id),
  ),
)
router.get(
  '/:locationId/purchase-orders/:id',
  validateParams(centerParamsSchema),
  run('view', (req) => service.purchaseOrderDetail(scope(req), id(req))),
)
router.post(
  '/:locationId/purchase-orders',
  validateParams(centerScopeSchema),
  validateBody(purchaseOrderSchema),
  run(
    'create',
    (req, permissions) =>
      service.savePurchaseOrder(scope(req), purchaseOrderSchema.parse(req.body), req.user!.id, permissions.autoApprove),
    201,
  ),
)
router.put(
  '/:locationId/purchase-orders/:id',
  validateParams(centerParamsSchema),
  validateBody(purchaseOrderSchema),
  run('update', (req, permissions) =>
    service.savePurchaseOrder(
      scope(req),
      purchaseOrderSchema.parse(req.body),
      req.user!.id,
      permissions.autoApprove,
      id(req),
    ),
  ),
)
router.post(
  '/:locationId/purchase-orders/:id/decision',
  validateParams(centerParamsSchema),
  validateBody(z.object({ action: z.enum(['approve', 'reject']) }).strict()),
  run('update', (req, permissions) => {
    if (!permissions.approve) throw new InventoryError(403, 'Only super-admins can approve or reject purchase orders')
    return service.decidePurchaseOrder(scope(req), id(req), req.body.action, req.user!.id)
  }),
)
router.delete(
  '/:locationId/purchase-orders/:id',
  validateParams(centerParamsSchema),
  run('delete', (req) => service.deletePurchaseOrder(scope(req), id(req))),
)
router.post(
  '/:locationId/purchase-orders/:id/receive',
  validateParams(centerParamsSchema),
  validateBody(receiptSchema),
  run('create', (req) => service.receiveStock(scope(req), receiptSchema.parse(req.body), req.user!.id, id(req)), 201),
)
router.post(
  '/:locationId/stock-in',
  validateParams(centerScopeSchema),
  validateBody(receiptSchema),
  run('create', (req) => service.receiveStock(scope(req), receiptSchema.parse(req.body), req.user!.id), 201),
)
router.get(
  '/:locationId/transactions/:id',
  validateParams(centerParamsSchema),
  run('view', (req) => service.stockTransactionDetail(scope(req), id(req))),
)
router.put(
  '/:locationId/suppliers/:id',
  validateParams(centerParamsSchema),
  validateBody(vendorSchema.omit({ locationIds: true })),
  run('update', (req) =>
    service.updateCenterSupplier(
      scope(req),
      id(req),
      vendorSchema.omit({ locationIds: true }).parse(req.body),
      req.user!.id,
    ),
  ),
)
router.delete(
  '/:locationId/suppliers/:id',
  validateParams(centerParamsSchema),
  run('delete', (req) => service.removeCenterSupplier(scope(req), id(req), req.user!.id)),
)
router.get(
  '/:locationId/items/:id/editor',
  validateParams(centerParamsSchema),
  run('update', (req) => service.centerItemEditor(scope(req), id(req), req.user!.id)),
)
router.put(
  '/:locationId/items/:id',
  validateParams(centerParamsSchema),
  validateBody(itemSchema),
  run('update', (req) => service.saveCenterItem(scope(req), id(req), itemSchema.parse(req.body), req.user!.id)),
)
router.get(
  '/:locationId/assignment-recipients',
  validateParams(centerScopeSchema),
  validateQuery(recipientQuerySchema),
  run('create', (req) => service.assignmentRecipients(scope(req), recipientQuerySchema.parse(req.query))),
)
router.post(
  '/:locationId/assign-items/preview',
  validateParams(centerScopeSchema),
  validateBody(assignmentSchema),
  run('create', (req) => service.previewAssignment(scope(req), assignmentSchema.parse(req.body))),
)
router.post(
  '/:locationId/assign-items',
  validateParams(centerScopeSchema),
  validateBody(assignmentSchema),
  run('create', (req) => service.assignItems(scope(req), assignmentSchema.parse(req.body), req.user!.id), 201),
)
export default router
