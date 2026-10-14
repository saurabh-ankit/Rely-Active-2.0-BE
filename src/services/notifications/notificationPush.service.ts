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
    occurredAt: event.occurredAt.toISOString(),
    payload: payloadJson ? payloadJson.slice(0, 1000) : '',
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
