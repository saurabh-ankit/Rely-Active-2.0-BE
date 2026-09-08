import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { upload } from '../../middlewares/upload.js'
import { validateBody } from '../../middlewares/validate/index.js'
import {
  createCareTaskSchema,
  createPackageSchema,
  updateCareTaskSchema,
  updatePackageSchema,
} from '../../validations/globalSettings.validation.js'
import {
  createCareTask,
  createPackage,
  deleteCareTask,
  deletePackage,
  getAllCareTasks,
  getAllPackages,
  getCareTaskById,
  getPackageById,
  updateCareTask,
  updatePackage,
} from '../controllers/globalSettings.controller.js'

const uploadTaskImage = upload.fields([
  { name: 'careTaskImage', maxCount: 1 },
  { name: 'taskImage', maxCount: 1 },
  { name: 'image', maxCount: 1 },
])

// ── Dedicated Care Task Router ───────────────────────────────────────────────
const careTaskRouter = Router({ mergeParams: true })
careTaskRouter.use(authenticate)
careTaskRouter.get('/', getAllCareTasks)
careTaskRouter.post('/', uploadTaskImage, validateBody(createCareTaskSchema), createCareTask)
careTaskRouter.get('/:id', getCareTaskById)
careTaskRouter.put('/:id', uploadTaskImage, validateBody(updateCareTaskSchema), updateCareTask)
careTaskRouter.delete('/:id', deleteCareTask)

// ── Dedicated Package Router ─────────────────────────────────────────────────
const packageRouter = Router({ mergeParams: true })
packageRouter.use(authenticate)
packageRouter.get('/', getAllPackages)
packageRouter.post('/', validateBody(createPackageSchema), createPackage)
packageRouter.get('/:id', getPackageById)
packageRouter.put('/:id', validateBody(updatePackageSchema), updatePackage)
packageRouter.delete('/:id', deletePackage)

// ── Global Settings Router (aggregates sub-routers under /global-settings) ───
const globalSettingsRouter = Router({ mergeParams: true })
globalSettingsRouter.use(authenticate)
globalSettingsRouter.use('/care-tasks', careTaskRouter)
globalSettingsRouter.use('/tasks', careTaskRouter)
globalSettingsRouter.use('/packages', packageRouter)

export { globalSettingsRouter, careTaskRouter, packageRouter }
export default globalSettingsRouter
