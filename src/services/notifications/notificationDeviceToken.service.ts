import { Op, type WhereOptions } from 'sequelize'
import {
  NotificationAppSurface,
  NotificationDevicePlatform,
  NotificationRecipientType,
} from '../../enums/notification.enum.js'
import { NotificationDeviceToken } from '../../models/index.js'

export interface NotificationRecipientIdentity {
  recipientType: NotificationRecipientType
  recipientUserId?: string | null
  recipientResidentId?: string | null
  recipientFamilyMemberId?: string | null
}

interface NormalizedRecipientIdentity {
  recipientType: NotificationRecipientType
  recipientUserId: string | null
  recipientResidentId: string | null
  recipientFamilyMemberId: string | null
}

export interface RegisterDeviceTokenInput extends NotificationRecipientIdentity {
  appSurface: NotificationAppSurface
  platform?: NotificationDevicePlatform | string | null | undefined
  fcmToken?: string | null | undefined
  deviceId?: string | null | undefined
  appVersion?: string | null | undefined
  createdBy?: string | null
}

export interface DeactivateDeviceTokenInput extends NotificationRecipientIdentity {
  fcmToken: string
  reason?: string | null
  updatedBy?: string | null
}

export interface ListActiveTokensOptions {
  appSurface?: NotificationAppSurface
  platform?: NotificationDevicePlatform
}

const PLATFORM_BY_SURFACE: Record<NotificationAppSurface, NotificationDevicePlatform> = {
  [NotificationAppSurface.WEB_APP]: NotificationDevicePlatform.WEB,
  [NotificationAppSurface.MOBILE_L1]: NotificationDevicePlatform.ANDROID,
  [NotificationAppSurface.MOBILE_L3]: NotificationDevicePlatform.ANDROID,
}

function normalizeString(value?: string | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || null
}

function normalizeRecipient(identity: NotificationRecipientIdentity): NormalizedRecipientIdentity | null {
  if (identity.recipientType === NotificationRecipientType.USER && identity.recipientUserId) {
    return {
      recipientType: NotificationRecipientType.USER,
      recipientUserId: identity.recipientUserId,
      recipientResidentId: null,
      recipientFamilyMemberId: null,
    }
  }

  if (identity.recipientType === NotificationRecipientType.RESIDENT && identity.recipientResidentId) {
    return {
      recipientType: NotificationRecipientType.RESIDENT,
      recipientUserId: null,
      recipientResidentId: identity.recipientResidentId,
      recipientFamilyMemberId: null,
    }
  }

  if (identity.recipientType === NotificationRecipientType.FAMILY_MEMBER && identity.recipientFamilyMemberId) {
    return {
      recipientType: NotificationRecipientType.FAMILY_MEMBER,
      recipientUserId: null,
      recipientResidentId: null,
      recipientFamilyMemberId: identity.recipientFamilyMemberId,
    }
  }

  return null
}

function recipientWhere(recipient: NormalizedRecipientIdentity): WhereOptions {
  if (recipient.recipientType === NotificationRecipientType.USER) {
    return {
      recipientType: NotificationRecipientType.USER,
      recipientUserId: recipient.recipientUserId,
    }
  }

  if (recipient.recipientType === NotificationRecipientType.RESIDENT) {
    return {
      recipientType: NotificationRecipientType.RESIDENT,
      recipientResidentId: recipient.recipientResidentId,
    }
  }

  return {
    recipientType: NotificationRecipientType.FAMILY_MEMBER,
    recipientFamilyMemberId: recipient.recipientFamilyMemberId,
  }
}

function normalizePlatform(
  appSurface: NotificationAppSurface,
  input?: NotificationDevicePlatform | string | null,
): NotificationDevicePlatform {
  const platform = normalizeString(input)
  if (platform === NotificationDevicePlatform.WEB) return NotificationDevicePlatform.WEB
  if (platform === NotificationDevicePlatform.ANDROID) return NotificationDevicePlatform.ANDROID
  if (platform === NotificationDevicePlatform.IOS) return NotificationDevicePlatform.IOS
  return PLATFORM_BY_SURFACE[appSurface]
}

/**
 * Register one token for one logged-in user/device pair.
 * If the device rotates a token, we inactivate the previous one.
 */
export async function registerDeviceToken(input: RegisterDeviceTokenInput): Promise<NotificationDeviceToken | null> {
  const recipient = normalizeRecipient(input)
  if (!recipient) {
    return null
  }

  const fcmToken = normalizeString(input.fcmToken)
  if (!fcmToken) {
    return null
  }

  const now = new Date()
  const deviceId = normalizeString(input.deviceId)
  const appVersion = normalizeString(input.appVersion)
  const platform = normalizePlatform(input.appSurface, input.platform)
  const updatedBy = input.createdBy || null

  if (deviceId) {
    await NotificationDeviceToken.update(
      {
        isActive: false,
        invalidatedAt: now,
        invalidationReason: 'TOKEN_ROTATED',
        updatedBy,
      },
      {
        where: {
          ...recipientWhere(recipient),
          appSurface: input.appSurface,
          deviceId,
          isActive: true,
          fcmToken: { [Op.ne]: fcmToken },
        },
      },
    )
  }

  const existingToken = await NotificationDeviceToken.findOne({ where: { fcmToken } })
  if (existingToken) {
    await existingToken.update({
      ...recipient,
      appSurface: input.appSurface,
      platform,
      deviceId,
      appVersion,
      isActive: true,
      lastRegisteredAt: now,
      lastSeenAt: now,
      invalidatedAt: null,
      invalidationReason: null,
      updatedBy,
    })
    return existingToken
  }

  return NotificationDeviceToken.create({
    ...recipient,
    appSurface: input.appSurface,
    platform,
    deviceId,
    fcmToken,
    appVersion,
    isActive: true,
    lastRegisteredAt: now,
    lastSeenAt: now,
    invalidatedAt: null,
    invalidationReason: null,
    createdBy: updatedBy,
    updatedBy,
  })
}

export async function registerDeviceTokenSafe(input: RegisterDeviceTokenInput): Promise<void> {
  try {
    await registerDeviceToken(input)
  } catch (error) {
    console.error('Failed to register notification device token:', error)
  }
}

export async function deactivateDeviceToken(input: DeactivateDeviceTokenInput): Promise<number> {
  const recipient = normalizeRecipient(input)
  const fcmToken = normalizeString(input.fcmToken)
  if (!recipient || !fcmToken) {
    return 0
  }

  const [affected] = await NotificationDeviceToken.update(
    {
      isActive: false,
      invalidatedAt: new Date(),
      invalidationReason: normalizeString(input.reason) || 'MANUAL_DEACTIVATION',
      updatedBy: input.updatedBy || null,
    },
    {
      where: {
        ...recipientWhere(recipient),
        fcmToken,
        isActive: true,
      },
    },
  )

  return affected
}

export async function deactivateDeviceTokensByTokens(
  tokens: string[],
  reason = 'MANUAL_DEACTIVATION',
): Promise<number> {
  const cleanedTokens = Array.from(
    new Set(tokens.map((token) => normalizeString(token)).filter((token): token is string => Boolean(token))),
  )
  if (cleanedTokens.length === 0) {
    return 0
  }

  const [affected] = await NotificationDeviceToken.update(
    {
      isActive: false,
      invalidatedAt: new Date(),
      invalidationReason: normalizeString(reason) || 'MANUAL_DEACTIVATION',
    },
    {
      where: {
        fcmToken: { [Op.in]: cleanedTokens },
        isActive: true,
      },
    },
  )

  return affected
}

export async function listActiveTokensByRecipients(
  recipients: NotificationRecipientIdentity[],
  options?: ListActiveTokensOptions,
): Promise<string[]> {
  const normalizedRecipients = recipients
    .map((recipient) => normalizeRecipient(recipient))
    .filter((recipient): recipient is NormalizedRecipientIdentity => Boolean(recipient))

  if (normalizedRecipients.length === 0) {
    return []
  }

  const rows = await NotificationDeviceToken.findAll({
    where: {
      isActive: true,
      ...(options?.appSurface ? { appSurface: options.appSurface } : {}),
      ...(options?.platform ? { platform: options.platform } : {}),
      [Op.or]: normalizedRecipients.map((recipient) => recipientWhere(recipient)),
    },
    attributes: ['fcmToken'],
  })

  return Array.from(
    new Set(rows.map((row) => normalizeString(row.fcmToken)).filter((token): token is string => Boolean(token))),
  )
}
