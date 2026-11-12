import cron from 'node-cron'
import { expireOffers } from '../ticketAutoAssign.service.js'

let running = false

/**
 * Ticket auto-assign: every minute, offers nobody answered in time are recorded as "No response"
 * and the ticket moves to the next staff member (or is escalated).
 */
export const startTicketAutoAssignExpiryCron = () => {
  cron.schedule('* * * * *', async () => {
    // A slow run must not overlap the next one
    if (running) return
    running = true
    try {
      const expired = await expireOffers()
      if (expired > 0) console.log(`[TICKET AUTO-ASSIGN CRON] ${expired} offer(s) expired and moved on`)
    } catch (error) {
      console.error('[TICKET AUTO-ASSIGN CRON] Failed:', error)
    } finally {
      running = false
    }
  })
}
