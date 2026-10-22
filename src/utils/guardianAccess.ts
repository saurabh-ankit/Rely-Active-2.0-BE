/**
 * What a guardian (non-residing family member looking after the flat's residents) may call.
 *
 * Can do: service requests, book a venue, guest meals and room service, doctor appointments,
 * upload documents, view / download bills, contact the property admin, share feedback.
 * Can view: events, menu, guests (gate entries — view only), medical details, event and dining
 * attendance. Everything else in the resident app (gate approvals, profile changes, amenities,
 * notifications, …) and every non-resident API is refused.
 */

const L1_PREFIX = '/api/v1/mobile/l1'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface Rule {
  methods: Method[] | '*'
  pattern: RegExp
}

const ALL = '*' as const
const READ: Method[] = ['GET']

const RULES: Rule[] = [
  // Guardian's own endpoints: profile & people, contact admin, attendance, documents
  { methods: ['GET', 'POST'], pattern: /^\/guardian(\/.*)?$/ },
  // Selected resident's profile (view only)
  { methods: READ, pattern: /^\/(resident|residents)\/details$/ },
  { methods: READ, pattern: /^\/(auth|resident|resident\/auth)\/profile$/ },
  // 1. Service requests (raise, track, escalate, feedback)
  { methods: ALL, pattern: /^\/tickets?(\/.*)?$/ },
  // 2. Book a venue + view events
  { methods: ALL, pattern: /^\/(events?\/)?(event-requests|requests)(\/.*)?$/ },
  { methods: READ, pattern: /^\/(events?|venues)(\/.*)?$/ },
  // 3/4. Guest meals & room service + view menu and orders
  { methods: READ, pattern: /^\/fnb(\/.*)?$/ },
  { methods: ['POST'], pattern: /^\/fnb\/order$/ },
  // 5. Doctor appointments + view medical details
  { methods: ALL, pattern: /^\/(medical\/)?appointments(\/.*)?$/ },
  { methods: READ, pattern: /^\/medical\/history(\/.*)?$/ },
  // 7. Bills: view and download only
  { methods: READ, pattern: /^\/billing(\/.*)?$/ },
  // 9. Feedback forms
  { methods: ['GET', 'POST'], pattern: /^\/feedback-forms(\/.*)?$/ },
  // Guests at the gate: view only (no approvals, no invites)
  { methods: READ, pattern: /^\/(gns|gate)\/(entries|preapproved|preapproved\/walkins|guest-master)$/ },
  // Home banners
  { methods: READ, pattern: /^\/advertisements(\/.*)?$/ },
]

/** Whether a guardian may make this request (`originalUrl` includes the /api/v1/mobile/l1 prefix). */
export function isGuardianAllowed(method: string, originalUrl: string): boolean {
  const path = originalUrl.split('?')[0] ?? ''
  if (!path.startsWith(L1_PREFIX)) return false
  const sub = path.slice(L1_PREFIX.length).replace(/\/+$/, '') || '/'
  const verb = method.toUpperCase() as Method
  return RULES.some((rule) => (rule.methods === ALL || rule.methods.includes(verb)) && rule.pattern.test(sub))
}
