import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { careTaskRouter, packageRouter } from './globalSettings.js'
import packageSubscriptionRouter from './packageSubscription.routes.js'
import careTaskAssignmentRouter from './careTaskAssignment.routes.js'
import { getCareTaskCompletions } from '../controllers/careTaskAssignment.controller.js'

/**
 * Dedicated Medical Router
 * Exposes:
 *  1. Care Tasks:           /medical/care-tasks
 *  2. Care Packages:        /medical/care-packages
 *  3. Subscriptions:        /medical/subscriptions
 *  4. Care Task Assignments / Complete: /medical/assignments & /medical/care-task-assignments
 *  5. Care Task Completions: /medical/completions & /medical/assignments/completions
 *
 * All controllers are served directly from src/web-app/controllers/globalSettings.controller.ts
 * and src/web-app/controllers/careTaskAssignment.controller.ts,
 * supporting both global templates and location-scoped tasks/packages seamlessly.
 */
export const medicalRouter = Router({ mergeParams: true })
medicalRouter.use(authenticate)

// 1. Care Tasks
medicalRouter.use('/care-tasks', careTaskRouter)

// 2. Care Packages
medicalRouter.use('/care-packages', packageRouter)

// 3. Package Subscriptions (Medical Subscriptions)
medicalRouter.use('/subscriptions', packageSubscriptionRouter)

// 4. Care Task Completions (Audit log & completion history)
medicalRouter.get('/completions', getCareTaskCompletions)

// 5. Care Task Assignments & Complete Task
medicalRouter.use('/assignments', careTaskAssignmentRouter)
medicalRouter.use('/care-task-assignments', careTaskAssignmentRouter)

export { careTaskRouter, packageRouter, careTaskAssignmentRouter }
export default medicalRouter
