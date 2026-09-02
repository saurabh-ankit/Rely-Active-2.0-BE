import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { upload } from '../../middlewares/upload.js'
import {
  addTicketComment,
  assignTicket,
  createTicket,
  deleteTicket,
  getAssignableEmployees,
  getCategoriesAndSubCategories,
  getPropertyUnitsForLocation,
  getTicketById,
  getTickets,
  getTicketStats,
  updateTicketOptions,
} from '../controllers/ticket.controller.js'

const ticketRouter = Router({ mergeParams: true })

ticketRouter.use(authenticate)

ticketRouter.get('/categories', getCategoriesAndSubCategories)
ticketRouter.get('/units', getPropertyUnitsForLocation)
ticketRouter.get('/assignable-employees', getAssignableEmployees)
ticketRouter.get('/stats', getTicketStats)
ticketRouter.get('/', getTickets)
ticketRouter.post('/', upload.single('attachment'), createTicket)
ticketRouter.get('/:id', getTicketById)
ticketRouter.patch('/:id/options', updateTicketOptions)
ticketRouter.patch('/:id/assign', assignTicket)
ticketRouter.post('/:id/comments', upload.single('attachment'), addTicketComment)
ticketRouter.delete('/:id', deleteTicket)

export default ticketRouter
