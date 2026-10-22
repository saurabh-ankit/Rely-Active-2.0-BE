import type { NotificationEvent } from '../../models/index.js'
import {
  deactivateDeviceTokensByTokens,
  listActiveTokensByRecipients,
  type NotificationRecipientIdentity,
} from './notificationDeviceToken.service.js'
import { sendPushToTokens } from './firebaseAdmin.service.js'
import { logger } from '../../config/logger.js'

const INVALID_FCM_TOKEN_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
])

export interface DispatchNotificationPushInput {
  event: NotificationEvent
  recipients: NotificationRecipientIdentity[]
}

function toDataValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function buildPushData(event: NotificationEvent): Record<string, string> {
  const payloadJson = event.payload ? JSON.stringify(event.payload) : ''
  return {
    notificationId: event.id,
    module: toDataValue(event.module),
    eventCode: toDataValue(event.eventCode),
    entityType: toDataValue(event.entityType),
    entityId: toDataValue(event.entityId),
    actionType: toDataValue(event.actionType),
    actionValue: toDataValue(event.actionValue),
    severity: toDataValue(event.severity),
    // Who did it (RESIDENT / FAMILY_MEMBER from the resident app, USER for staff, SYSTEM), so the
    // app can keep a resident's own actions to the notification bar
    actorType: toDataValue(event.actorType),
    occurredAt: event.occurredAt.toISOString(),
    // FCM data is limited to 4KB; a cut-off JSON can't be parsed, so drop an oversized payload
    title: toDataValue(event.title),
    message: toDataValue(event.message),
    payload: payloadJson.length <= 2000 ? payloadJson : '',
  }
}

function extractInvalidTokens(result: Awaited<ReturnType<typeof sendPushToTokens>>): string[] {
  const invalidTokens = new Set<string>()
  for (const batch of result.batches) {
    batch.response.responses.forEach((response, index) => {
      if (response.success) return
      const code = response.error?.code || ''
      if (INVALID_FCM_TOKEN_ERRORS.has(code)) {
        const token = batch.tokens[index]
        if (token) invalidTokens.add(token)
      }
    })
  }
  return Array.from(invalidTokens)
}

/**
 * Android channels the mobile apps create; each kind of push goes to its own channel. The `_v2`
 * channels carry the apps' custom sounds (Android fixes a channel's sound when it is created).
 */
export const ANDROID_CHANNELS = {
  TICKETS: 'tickets_v2',
  GATE_APPROVALS: 'gate_approvals_v2',
  GATE_UPDATES: 'gate_updates_v2',
} as const

/** The apps' notification sound (android/app/src/main/res/raw/rely_alert.mp3). */
export const ANDROID_NOTIFICATION_SOUND = 'rely_alert'

/** Gate approval requests (and their "already decided" follow-ups) are handled by the app itself. */
const DATA_ONLY_EVENTS = new Set(['GATE_VISITOR_APPROVAL_REQUESTED', 'GATE_VISITOR_DECIDED'])

/** How long a gate approval is worth delivering: after that the visitor has left or been let in. */
const GATE_APPROVAL_TTL_SECONDS = 10 * 60

function pushOptions(event: NotificationEvent) {
  if (event.module === 'GATE') {
    const dataOnly = DATA_ONLY_EVENTS.has(event.eventCode)
    return {
      dataOnly,
      androidChannelId: dataOnly ? ANDROID_CHANNELS.GATE_APPROVALS : ANDROID_CHANNELS.GATE_UPDATES,
      androidSound: ANDROID_NOTIFICATION_SOUND,
      ttlSeconds: GATE_APPROVAL_TTL_SECONDS,
    }
  }
  return { androidChannelId: ANDROID_CHANNELS.TICKETS, androidSound: ANDROID_NOTIFICATION_SOUND }
}

export async function dispatchNotificationPush(input: DispatchNotificationPushInput): Promise<void> {
  const tokens = await listActiveTokensByRecipients(input.recipients)
  if (tokens.length === 0) {
    return
  }

  const result = await sendPushToTokens({
    tokens,
    title: input.event.title,
    body: input.event.message,
    data: buildPushData(input.event),
    ...pushOptions(input.event),
  })

  if (result.skipped) {
    return
  }

  const invalidTokens = extractInvalidTokens(result)
  if (invalidTokens.length > 0) {
    await deactivateDeviceTokensByTokens(invalidTokens, 'FCM_TOKEN_INVALID')
  }

  logger.info(
    {
      eventId: input.event.id,
      targetedTokens: tokens.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      invalidTokenCount: invalidTokens.length,
    },
    'Notification push dispatch completed',
  )
}

export async function dispatchNotificationPushSafe(input: DispatchNotificationPushInput): Promise<void> {
  try {
    await dispatchNotificationPush(input)
  } catch (error) {
    logger.error({ error, eventId: input.event.id }, 'Notification push dispatch failed')
  }
}
