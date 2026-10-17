import { Router } from 'express'
import staffAuthRouter from './staffAuth.routes.js'
import ticketStaffMobileRouter from './ticketStaffMobile.routes.js'
import gnsRouter from './gns.routes.js'
import fnbEmployeeRouter from './fnbEmployee.routes.js'
import attendanceRouter from './attendance.routes.js'
import medicalRouter from './medical.routes.js'
import notificationRouter from '../../../web-app/routes/notification.routes.js'
import feedbackStaffRouter, { advertisementStaffRouter } from './feedbackStaff.routes.js'

export const l3MobileRouter = Router()

// Health check
l3MobileRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rely-active-L3-mobile-app' })
})

// ── Staff Auth Module (/api/v1/mobile/l3/auth, /api/v1/mobile/l3/staff/auth, /api/v1/mobile/l3/staff) ──
l3MobileRouter.use('/auth', staffAuthRouter)
l3MobileRouter.use('/staff/auth', staffAuthRouter)
l3MobileRouter.use('/staff', staffAuthRouter)

// ── Staff Tickets Module (/api/v1/mobile/l3/tickets & /api/v1/mobile/l3/ticket) ──
l3MobileRouter.use('/tickets', ticketStaffMobileRouter)
l3MobileRouter.use('/ticket', ticketStaffMobileRouter)

// ── Staff F&B Module (/api/v1/mobile/l3/fnb) ──
l3MobileRouter.use('/fnb', fnbEmployeeRouter)

// ── Attendance staff: dine-in and event attendance (/api/v1/mobile/l3/attendance) ──
l3MobileRouter.use('/attendance', attendanceRouter)

// ── L3 Gate & Security Module (/api/v1/mobile/l3/gns & /api/v1/mobile/l3/gate) ──
l3MobileRouter.use('/gns', gnsRouter)
l3MobileRouter.use('/gate', gnsRouter)

// Medical / Nurse Care Tasks (/api/v1/mobile/l3/medical)
l3MobileRouter.use('/medical', medicalRouter)

// ── In-app notifications & push devices (/api/v1/mobile/l3/notifications), same API as the web ──
l3MobileRouter.use('/notifications', notificationRouter)

// ── Feedback Forms (/api/v1/mobile/l3/feedback-forms) ──
l3MobileRouter.use('/feedback-forms', feedbackStaffRouter)
l3MobileRouter.use('/advertisements', advertisementStaffRouter)

export default l3MobileRouter
