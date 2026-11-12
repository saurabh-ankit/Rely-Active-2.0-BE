# Ticket Auto-Assign — Approach

Status: backend built and tested (5 Nov 2026); Staff App and Admin Dashboard next.
Apps: Backend (Rely-Active-2.0-BE), Staff App (primus-rely-L3), Admin Dashboard (Rely-Active-2.0-FE).
The Resident App (primus-rely) needs no change: residents raise tickets as today.

## 1. Goal

When auto-assign is turned on for a property and department, a ticket raised by a resident is
offered automatically to the most suitable staff member on shift. The staff member accepts (and
sets the TAT) or rejects (with a reason). A rejected ticket moves to the next staff member. If
everyone rejects, or nobody matches, the ticket is escalated automatically. Every step is logged
and shown on the Admin Dashboard.

## 2. Agreed rules

| Topic                                               | Decision                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| How staff respond                                   | A popup in the Staff App with **Accept** and **Reject**                                                                  |
| Reject                                              | A reason text box appears; the reason is **required**                                                                    |
| Accept                                              | A TAT screen appears; the staff member **sets the TAT** before the ticket is assigned                                    |
| Who is eligible                                     | Only staff **on shift now**                                                                                              |
| Toggle scope                                        | **Per property and per department**                                                                                      |
| Nobody matches (no staff in that category on shift) | **Wait 1 minute**, check the roster again; still nobody → **escalate**                                                   |
| Everyone rejects                                    | **Auto-escalate**; ticket shows with **Auto** and **Escalated** tags                                                     |
| Order of offers                                     | Lowest **total TAT load** first (see section 4)                                                                          |
| Response time                                       | **2 minutes** per staff member (a setting per property); no response counts as a rejection with the reason "No response" |
| Which tickets                                       | Only tickets **raised by residents**; tickets created from the Admin Dashboard are always assigned **manually**          |

## 3. What already exists and is reused

- Resident tickets already get `departmentId` and `jobCategoryId` when raised
  (`mobile-app/L1/controllers/ticketMobile.controller.ts`), so "related staff" can be found.
- Staff ranking and on-shift check: `getAssignableEmployees` and `getShiftInfoForEmployees` in
  `web-app/controllers/ticket.controller.ts`.
- Assigning: `assignTicket` (sets the assignee, writes the activity log, sends `TICKET_ASSIGNED`).
- TAT: `tickets.tatOption` and `tickets.customTatDeadline`; the Staff App TAT options are
  `30 mins`, `1-2 hour`, `2-5 hours`, `Custom` (`components/StaffTickets/helpers.ts`), and the
  staff TAT endpoint `PATCH /tickets/:id/tat`.
- Escalation fields on `tickets`: `escalatedAt`, `escalatedByUserId`, `escalatedByName`,
  `escalationReason`; the Admin Dashboard already lists escalated tickets first.
- Activity timeline: `ticket_activity_logs`.
- Scheduled jobs: `node-cron` (already used for the monthly package reset).
- The "automate tickets" switch on the Admin Tickets page exists but is not wired up.

## 4. Choosing the staff member

1. **Candidates:** operational staff (role `EMPLOYEE`) at the ticket's property whose posting
   matches the ticket's **job category**; if none, those matching its **department**.
2. **On shift now:** a shift assignment covering today and the current time (Indian time), and
   no shift date for today marked `absent`, `day_off` or `covered`. The attendance buffers
   (60 / 120 min) are not used: only staff actually inside their shift hours get offers.
3. **TAT load:** for each candidate, add up the time still left on their open tickets
   (`OPEN`, `IN_PROGRESS`, `ON_HOLD`):
   - `30 mins` → 30 min, `1-2 hour` → 120 min, `2-5 hours` → 300 min, counted from when the
     ticket was assigned to them;
   - `Custom` → time until `customTatDeadline`;
   - overdue tickets count as 0.
4. **Order:** lowest TAT load first; ties go to fewer open tickets, then to the staff member
   assigned least recently.
5. A staff member is offered the same ticket only once.

## 5. Flow

1. Resident raises a ticket. If auto-assign is on for that property and department, the backend
   starts auto-assign. Tickets created from the Admin Dashboard never auto-assign; the admin
   assigns them manually as today.
2. The ranked list is built. If it is empty, the ticket **waits 1 minute** (`WAITING`, logged) and
   the roster is checked again: someone on shift now → offered to them; still nobody → escalated
   (step 7).
3. The ticket is **offered** to the first staff member: a push with the ticket details and
   Accept/Reject; the popup opens in the Staff App.
4. **Accept** → the TAT screen opens. The staff member picks a TAT (or a custom deadline) and
   confirms. The ticket is assigned to them with that TAT, shows in their Tickets section with an
   **Auto** tag, and the resident gets the usual "assigned" update.
5. **Reject** → the staff member enters a reason (required). The ticket is offered to the next
   staff member.
6. **No response** within the time limit → recorded as rejected ("No response"); next staff
   member.
7. **Nobody left** (all rejected or did not respond), or nobody matched → **auto-escalate**:
   - `escalatedAt` = now, `escalatedByName` = "Auto-assign",
     `escalationReason` = e.g. "All 3 matching staff rejected or did not respond" or
     "No staff on shift for Electrical";
   - the ticket stays unassigned, shows with **Auto** and **Escalated** tags;
   - property admins get the existing escalation notification and assign it manually.
8. Every step is written to the auto-assign log (section 6) until the ticket is accepted or
   escalated.

An admin can assign a ticket manually at any time; that ends auto-assign for it (logged).

## 6. Backend

### 6.1 New tables (migrations)

`ticket_auto_assign_settings`

| Column                   | Notes                                              |
| ------------------------ | -------------------------------------------------- |
| `id`                     | UUID                                               |
| `locationId`             | property                                           |
| `departmentId`           | department (one row per property + department)     |
| `isEnabled`              | the toggle                                         |
| `responseTimeoutMinutes` | default 2                                          |
| audit columns            | `createdBy`, `updatedBy`, `createdAt`, `updatedAt` |

`ticket_auto_assign_attempts` (the log shown on the Dashboard)

| Column                                  | Notes                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`                                    | UUID                                                                                                      |
| `ticketId`                              | ticket                                                                                                    |
| `userId`                                | staff member offered                                                                                      |
| `attemptNumber`                         | 1, 2, 3 …                                                                                                 |
| `tatLoadMinutes`                        | the staff member's TAT load when offered (why they were chosen)                                           |
| `status`                                | `OFFERED`, `WAITING` (the 1-minute wait; no staff member), `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED` |
| `reason`                                | reject reason (required for `REJECTED`), "No response" for `EXPIRED`                                      |
| `tatOption` / `customTatDeadline`       | the TAT set on accept                                                                                     |
| `offeredAt`, `respondedAt`, `expiresAt` | timings                                                                                                   |

New columns on `tickets`

| Column             | Notes                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| `autoAssignStatus` | `WAITING`, `OFFERED`, `ASSIGNED`, `ESCALATED`; null for manual tickets |
| `offeredToUserId`  | staff member currently holding the offer                               |

### 6.2 Service: `services/ticketAutoAssign.service.ts`

- `startAutoAssign(ticket)` — check settings, rank candidates, make the first offer or escalate.
- `rankCandidates(ticket)` — section 4; the ranking logic is moved out of
  `getAssignableEmployees` so both use the same code (the manual "Assign" list is unchanged).
- `offerTo(ticket, staff, attemptNumber)` — create the attempt, set `offeredToUserId`, send the
  offer push.
- `acceptOffer(ticketId, staffId, tat)` — assign with the TAT, mark the attempt `ACCEPTED`,
  `autoAssignStatus = ASSIGNED`.
- `rejectOffer(ticketId, staffId, reason)` — mark `REJECTED`, offer to the next candidate or
  escalate.
- `expireOffers()` — run by a cron every minute: offers past `expiresAt` become `EXPIRED` and move
  on.
- `escalate(ticket, reason)` — set the escalation fields, `autoAssignStatus = ESCALATED`, notify
  admins.
- The assign steps in `assignTicket` (log + `TICKET_ASSIGNED`) are moved into a shared function
  used by both manual and auto assignment.

### 6.3 Endpoints

| Method | Path                                                        | Who   | Purpose                                                                      |
| ------ | ----------------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| GET    | `/api/v1/location/:locationId/tickets/auto-assign-settings` | Admin | Settings per department                                                      |
| PUT    | `/api/v1/location/:locationId/tickets/auto-assign-settings` | Admin | Body: `{ settings: [{ departmentId, isEnabled, responseTimeoutMinutes? }] }` |
| GET    | `/api/v1/tickets/:id/auto-assign-log`                       | Admin | The log for one ticket                                                       |
| GET    | `/api/v1/mobile/l3/tickets/offers`                          | Staff | Offers waiting for me                                                        |
| POST   | `/api/v1/mobile/l3/tickets/:id/offer/accept`                | Staff | Body: `tatOption`, `customTatDeadline?`                                      |
| POST   | `/api/v1/mobile/l3/tickets/:id/offer/reject`                | Staff | Body: `reason` (required)                                                    |

### 6.4 Safety rules

- Accept/reject only succeed if the offer is still open **and** held by that staff member
  (conditional update), so a late tap, a double tap or a manual assign cannot give a ticket two
  assignees.
- Auto-assign is skipped for tickets that already have an assignee or a vendor, and for tickets
  created from the Admin Dashboard (only the resident ticket creation calls `startAutoAssign`).
- Errors in auto-assign never block ticket creation; the ticket stays unassigned and is logged.

### 6.5 Notifications

| Event                         | To                                      | Delivery                                                                                                                                               |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TICKET_ASSIGN_OFFER`         | only the staff member holding the offer | normal push (tickets channel, custom sound); payload has `ticketId`, `attemptId`, `expiresAt` and the ticket details; tapping it opens the offer popup |
| `TICKET_ASSIGNED` (existing)  | resident, assignee                      | on accept                                                                                                                                              |
| `TICKET_ESCALATED` (existing) | property admins, resident               | on auto-escalation                                                                                                                                     |

## 7. Staff App (primus-rely-L3)

- **Offer popup**: opens when the offer push arrives (app open) or is tapped (app closed), and
  from "Waiting for you"; shows ticket number, category, flat, resident's note, and a countdown
  to `expiresAt`. Accept / Reject are not notification buttons, because Accept needs the TAT
  screen and Reject needs the reason.
- **Reject:** a text box for the reason (required) and a Submit button.
- **Accept:** the TAT screen (the existing TAT options and custom deadline picker); Confirm
  assigns the ticket.
- **Waiting for you:** a list on the dashboard of open offers, so a missed popup is not lost.
- **Auto tag** on accepted auto-assigned tickets in the Tickets section.
- If the offer has already moved on or been assigned, the popup shows "This ticket is no longer
  available" and closes.

## 8. Admin Dashboard (Rely-Active-2.0-FE)

- **Settings:** the toggle per department for the selected property, and the response time.
- **Ticket list and detail:** **Auto**, **Escalated**, and "Waiting for <name> to accept" tags.
- **Auto-assign log** on the ticket detail, e.g.:
  1. Offered to Ramesh (TAT load 2h 10m) — Rejected: "On another job"
  2. Offered to Suresh (TAT load 3h) — No response in 2 min
  3. Offered to Anil (TAT load 3h 40m) — Accepted, TAT 1-2 hour
- Manual assign stays available and ends auto-assign for that ticket.

## 9. Build order

1. Backend: migrations, service, endpoints, cron, notifications — tested with curl.
2. Staff App: offer popup, reject reason, TAT screen, "Waiting for you", Auto tag.
3. Admin Dashboard: settings toggle, tags, log.
4. End-to-end test: three staff on shift in one category — accept; reject then accept;
   all reject → escalation; no staff on shift → immediate escalation; no response → timeout.

## 10. Notes

- Response time is 2 minutes for now; it is a per-property setting, so it can be changed later
  without code changes.
- Implementation (backend):
  - Migration `20261105100000-create-ticket-auto-assign`; models in `models/ticketAutoAssign.model.ts`.
  - Service `services/ticketAutoAssign.service.ts`; on-shift check shared with the Assign list
    in `services/staffShift.service.ts` (which now also skips staff marked absent / off today).
  - Cron `services/cron/ticketAutoAssignExpiry.ts` (every minute).
  - Hooks: resident ticket create (`startAutoAssignSafe`), manual assign
    (`endAutoAssignOnManualAssignSafe`: the open offer is marked `CANCELLED`, "Assigned manually").
  - The manual assign code is unchanged apart from that hook; the auto path writes its own activity
    log and `TICKET_ASSIGNED`.
  - Every change locks the ticket row; accept / reject return 409 "This ticket is no longer
    available" when the offer has moved on.
  - Ticket list and detail include `offeredToUser`; the L3 ticket format has `isAutoAssigned`.
