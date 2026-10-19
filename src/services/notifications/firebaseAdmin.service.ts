import type { App, AppOptions } from 'firebase-admin/app'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging'
import { getMessaging } from 'firebase-admin/messaging'
import { logger } from '../../config/logger.js'

const MAX_TOKENS_PER_REQUEST = 500

export interface SendPushToTokensInput {
  tokens: string[]
  title: string
  body: string
  data?: Record<string, string>
  /**
   * Data-only push (no `notification` block): Android hands it to the app's background
   * handler even when the app is closed, so the app can show its own notification
   * (e.g. with Approve / Deny buttons). Web still gets a visible notification.
   */
  dataOnly?: boolean
  /** Android notification channel the app created for this kind of push. */
  androidChannelId?: string
  /** Drop the push if it can't be delivered within this time (e.g. a gate approval). */
  ttlSeconds?: number
}

export interface PushBatchResult {
  tokens: string[]
  response: BatchResponse
}

export interface SendPushToTokensResult {
  successCount: number
  failureCount: number
  batches: PushBatchResult[]
  skipped: boolean
}

let firebaseApp: App | null = null
let initAttempted = false

function normalizePrivateKey(input?: string | null): string | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/\\n/g, '\n')
}

function resolveFirebaseOptions(): AppOptions | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)

  if (!projectId || !clientEmail || !privateKey) {
    return null
  }

  return {
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  }
}

function getFirebaseApp(): App | null {
  if (firebaseApp) {
    return firebaseApp
  }

  if (getApps().length > 0) {
    firebaseApp = getApps()[0] as App
    return firebaseApp
  }

  if (initAttempted) {
    return null
  }
  initAttempted = true

  const options = resolveFirebaseOptions()
  if (!options) {
    logger.warn(
      'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.',
    )
    return null
  }

  try {
    firebaseApp = initializeApp(options)
    logger.info('Firebase Admin initialized for push notifications')
    return firebaseApp
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Firebase Admin. Push dispatch is disabled.')
    return null
  }
}

function chunkTokens(tokens: string[], chunkSize = MAX_TOKENS_PER_REQUEST): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < tokens.length; index += chunkSize) {
    chunks.push(tokens.slice(index, index + chunkSize))
  }
  return chunks
}

export async function sendPushToTokens(input: SendPushToTokensInput): Promise<SendPushToTokensResult> {
  const app = getFirebaseApp()
  const cleanedTokens = Array.from(new Set(input.tokens.map((token) => token.trim()).filter(Boolean)))

  if (!app || cleanedTokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      batches: [],
      skipped: true,
    }
  }

  const ttl = input.ttlSeconds ? input.ttlSeconds * 1000 : undefined
  const messageBase: Omit<MulticastMessage, 'tokens'> = input.dataOnly
    ? {
        data: { ...(input.data || {}), title: input.title, body: input.body },
        android: { priority: 'high', ...(ttl ? { ttl } : {}) },
        webpush: {
          headers: { Urgency: 'high' },
          notification: { title: input.title, body: input.body },
        },
      }
    : {
        notification: {
          title: input.title,
          body: input.body,
        },
        ...(input.data ? { data: input.data } : {}),
        android: {
          priority: 'high',
          ...(ttl ? { ttl } : {}),
          ...(input.androidChannelId ? { notification: { channelId: input.androidChannelId, sound: 'default' } } : {}),
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
        },
      }

  let successCount = 0
  let failureCount = 0
  const batches: PushBatchResult[] = []

  for (const tokens of chunkTokens(cleanedTokens)) {
    const response = await getMessaging(app).sendEachForMulticast({
      ...messageBase,
      tokens,
    })
    successCount += response.successCount
    failureCount += response.failureCount
    batches.push({ tokens, response })
  }

  return {
    successCount,
    failureCount,
    batches,
    skipped: false,
  }
}
