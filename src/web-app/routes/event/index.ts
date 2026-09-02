import express from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import { validateBody } from '../../../middlewares/validate/index.js'
import { createEventSchema, updateEventSchema } from '../../../validations/event.validation.js'
import { createVenueSchema, updateVenueSchema } from '../../../validations/venue.validation.js'
import {
  bulkDeleteEvents,
  createEvent,
  deleteEvent,
  getAllEvents,
  getEventById,
  getEventsCalendar,
  updateEvent,
} from '../../controllers/event/event.controller.js'
import {
  getEventCapacity,
  getEventRegistrations,
  updateRegistrationStatus,
} from '../../controllers/event/eventRegistration.controller.js'
import {
  createVenue,
  deleteVenue,
  getAllVenues,
  getVenueById,
  updateVenue,
} from '../../controllers/event/venue.controller.js'

const venueRouter = express.Router({ mergeParams: true })
const eventRouter = express.Router({ mergeParams: true })

venueRouter.post(
  '/',
  authenticate,
  upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  validateBody(createVenueSchema),
  createVenue,
)
venueRouter.get('/', authenticate, getAllVenues)
venueRouter.get('/:id', authenticate, getVenueById)
venueRouter.put(
  '/:id',
  authenticate,
  upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  validateBody(updateVenueSchema),
  updateVenue,
)
venueRouter.delete('/:id', authenticate, deleteVenue)

eventRouter.post(
  '/',
  authenticate,
  upload.fields([{ name: 'poster', maxCount: 1 }]),
  validateBody(createEventSchema),
  createEvent,
)
eventRouter.get('/calendar', authenticate, getEventsCalendar)
eventRouter.get('/', authenticate, getAllEvents)
eventRouter.get('/:eventId/capacity', authenticate, getEventCapacity)
eventRouter.delete('/bulk', authenticate, bulkDeleteEvents)
eventRouter.post('/bulk-delete', authenticate, bulkDeleteEvents)
eventRouter.get('/:eventId/registrations', authenticate, getEventRegistrations)
eventRouter.put('/:eventId/registrations/:registrationId/status', authenticate, updateRegistrationStatus)
eventRouter.get('/:id', authenticate, getEventById)
eventRouter.put(
  '/:id',
  authenticate,
  upload.fields([{ name: 'poster', maxCount: 1 }]),
  validateBody(updateEventSchema),
  updateEvent,
)
eventRouter.delete('/:id', authenticate, deleteEvent)

export { venueRouter, eventRouter }
