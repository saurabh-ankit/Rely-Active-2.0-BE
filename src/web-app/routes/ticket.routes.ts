import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { upload } from '../../middlewares/upload.js'
import { validateBody } from '../../middlewares/validate/index.js'
import { handleWorkDetailsUpload } from '../../middlewares/workDetailsUpload.js'
import {
  adminCompleteTicketSchema,
  closeTicketSchema,
  editTicketWorkDetailsSchema,
} from '../../validations/ticketStaff.validation.js'
import {
  addTicketComment,
  assignTicket,
  closeTicketWithoutCompletion,
  completeTicketWork,
  editTicketWorkDetails,
  createTicket,
  deleteTicket,
  getAssignableEmployees,
  getCategoriesAndSubCategories,
  getPropertyUnitsForLocation,
  getTicketAutoAssignLog,
  getTicketAutoAssignSettings,
  getTicketById,
  getTickets,
  startTicketWork,
  getTicketStats,
  updateTicketAutoAssignSettings,
  updateTicketOptions,
  verifyTicket,
} from '../controllers/ticket.controller.js'

const ticketRouter = Router({ mergeParams: true })

ticketRouter.use(authenticate)

ticketRouter.get('/categories', getCategoriesAndSubCategories)
ticketRouter.get('/units', getPropertyUnitsForLocation)
ticketRouter.get('/assignable-employees', getAssignableEmployees)
ticketRouter.get('/stats', getTicketStats)
ticketRouter.get('/auto-assign-settings', getTicketAutoAssignSettings)
ticketRouter.put('/auto-assign-settings', updateTicketAutoAssignSettings)
ticketRouter.get('/', getTickets)
// A voice note (`audio`) plus up to 10 `photos`; `attachment` is the older single-file field.
ticketRouter.post(
  '/',
  upload.fields([
    { name: 'attachment', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
    { name: 'photos', maxCount: 10 },
  ]),
  createTicket,
)
ticketRouter.get('/:id', getTicketById)
ticketRouter.get('/:id/auto-assign-log', getTicketAutoAssignLog)
ticketRouter.patch('/:id/options', updateTicketOptions)
ticketRouter.patch('/:id/assign', assignTicket)
ticketRouter.patch('/:id/verify', verifyTicket)
// The admin doing the work themselves, or completing it for the assigned staff member
ticketRouter.post('/:id/start-work', startTicketWork)
// Close an Open / In Progress ticket without completing it (raised by mistake, duplicate, …)
ticketRouter.post('/:id/close', validateBody(closeTicketSchema), closeTicketWithoutCompletion)
ticketRouter.post('/:id/complete', handleWorkDetailsUpload, validateBody(adminCompleteTicketSchema), completeTicketWork)
// Correct the invoice amount / photos of a completed ticket
ticketRouter.patch(
  '/:id/work-details',
  handleWorkDetailsUpload,
  validateBody(editTicketWorkDetailsSchema),
  editTicketWorkDetails,
)
ticketRouter.post('/:id/comments', upload.single('attachment'), addTicketComment)
ticketRouter.delete('/:id', deleteTicket)

export default ticketRouter
