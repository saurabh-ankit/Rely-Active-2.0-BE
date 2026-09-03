import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { upload } from '../../middlewares/upload.js'
import { validateBody } from '../../middlewares/validate/index.js'
import {
  createEventSchema,
  updateEventSchema,
  createVenueSchema,
  updateVenueSchema,
  createGlobalServiceSchema,
  updateGlobalServiceSchema,
} from '../../validations/event.validation.js'
import {
  bulkDeleteEvents,
  createEvent,
  deleteEvent,
  getAllEvents,
  getEventById,
  getEventsCalendar,
  updateEvent,
  getEventCapacity,
  getEventRegistrations,
  updateRegistrationStatus,
  createVenue,
  deleteVenue,
  getAllVenues,
  getVenueById,
  updateVenue,
  createGlobalService,
  deleteGlobalService,
  getAllGlobalServices,
  getLocationGlobalServices,
  updateGlobalService,
} from '../controllers/event.controller.js'

const eventRouter = Router({ mergeParams: true })
const venueRouter = Router({ mergeParams: true })
const globalServiceRouter = Router({ mergeParams: true })

// ── Event Routes ──────────────────────────────────────────────────────────────
eventRouter.use(authenticate)
eventRouter.post('/', upload.fields([{ name: 'poster', maxCount: 1 }]), validateBody(createEventSchema), createEvent)
eventRouter.get('/calendar', getEventsCalendar)
eventRouter.get('/', getAllEvents)
eventRouter.get('/:eventId/capacity', getEventCapacity)
eventRouter.delete('/bulk', bulkDeleteEvents)
eventRouter.post('/bulk-delete', bulkDeleteEvents)
eventRouter.get('/:eventId/registrations', getEventRegistrations)
eventRouter.put('/:eventId/registrations/:registrationId/status', updateRegistrationStatus)
eventRouter.get('/:id', getEventById)
eventRouter.put('/:id', upload.fields([{ name: 'poster', maxCount: 1 }]), validateBody(updateEventSchema), updateEvent)
eventRouter.delete('/:id', deleteEvent)

// ── Venue Routes ──────────────────────────────────────────────────────────────
venueRouter.use(authenticate)
venueRouter.post(
  '/',
  upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  validateBody(createVenueSchema),
  createVenue,
)
venueRouter.get('/', getAllVenues)
venueRouter.get('/:id', getVenueById)
venueRouter.put(
  '/:id',
  upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  validateBody(updateVenueSchema),
  updateVenue,
)
venueRouter.delete('/:id', deleteVenue)

// ── Global Service Routes ─────────────────────────────────────────────────────
globalServiceRouter.use(authenticate)
globalServiceRouter.get('/', (req, res) => {
  const locId = (req.params as Record<string, string | undefined>).locationId
  if (locId) {
    return getLocationGlobalServices(req, res)
  }
  return getAllGlobalServices(req, res)
})
globalServiceRouter.post('/', upload.single('image'), validateBody(createGlobalServiceSchema), createGlobalService)
globalServiceRouter.put('/:id', upload.single('image'), validateBody(updateGlobalServiceSchema), updateGlobalService)
globalServiceRouter.delete('/:id', deleteGlobalService)

export { eventRouter, venueRouter, globalServiceRouter }
export default eventRouter
