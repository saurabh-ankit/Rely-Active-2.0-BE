import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateBody } from '../../middlewares/validate/index.js'
import {
  createCareTaskAssignmentSchema,
  updateCareTaskAssignmentSchema,
  completeCareTaskAssignmentSchema,
} from '../../validations/careTaskAssignment.validation.js'
import {
  createCareTaskAssignment,
  getAllCareTaskAssignments,
  getCareTaskAssignmentById,
  updateCareTaskAssignment,
  deleteCareTaskAssignment,
  completeCareTask,
  stopCareTaskAssignment,
  cancelCareTaskAssignment,
  getCareTaskCompletions,
} from '../controllers/careTaskAssignment.controller.js'

export const careTaskAssignmentRouter = Router({ mergeParams: true })

careTaskAssignmentRouter.use(authenticate)

// Get all care task assignments with filters & matrix
careTaskAssignmentRouter.get('/', getAllCareTaskAssignments)

// Get all care task completions / audit log
careTaskAssignmentRouter.get('/completions', getCareTaskCompletions)

// Create a new care task assignment
careTaskAssignmentRouter.post('/', validateBody(createCareTaskAssignmentSchema), createCareTaskAssignment)

// Complete a care task assignment (deducts complimentary quota or charges additional fee and creates ResidentCareTaskCompletion)
careTaskAssignmentRouter.post('/:id/complete', validateBody(completeCareTaskAssignmentSchema), completeCareTask)

// Get completions for a specific assignment
careTaskAssignmentRouter.get('/:id/completions', getCareTaskCompletions)

// Stop a care task assignment
careTaskAssignmentRouter.put('/:id/stop', stopCareTaskAssignment)

// Cancel a care task assignment
careTaskAssignmentRouter.put('/:id/cancel', cancelCareTaskAssignment)

// Get single care task assignment by ID
careTaskAssignmentRouter.get('/:id', getCareTaskAssignmentById)

// Update care task assignment
careTaskAssignmentRouter.put('/:id', validateBody(updateCareTaskAssignmentSchema), updateCareTaskAssignment)

// Soft delete care task assignment
careTaskAssignmentRouter.delete('/:id', deleteCareTaskAssignment)

export default careTaskAssignmentRouter
