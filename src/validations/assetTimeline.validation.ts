import { z } from 'zod'

export const ASSET_TIMELINE_EVENT_TYPES = [
  'created',
  'assigned',
  'returned',
  'external_use',
  'repair',
  'scrap',
  'qr_generated',
  'made_available',
] as const

/** Comma-separated list, e.g. `types=assigned,repair`. */
const eventTypeList = z
  .string()
  .trim()
  .optional()
  .transform((raw) => {
    const parts = (raw || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    return parts.length ? parts : undefined
  })
  .pipe(z.array(z.enum(ASSET_TIMELINE_EVENT_TYPES, { message: 'Invalid timeline event type' })).optional())

export const assetTimelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  type: z
    .enum(ASSET_TIMELINE_EVENT_TYPES, { message: 'Invalid timeline event type' })
    .optional()
    .or(z.literal('').transform(() => undefined)),
  types: eventTypeList,
})

export const assetTimelineParamSchema = z.object({
  id: z.string().uuid('Invalid asset id'),
  locationId: z.string().min(1).optional(),
})

export type AssetTimelineQuery = z.infer<typeof assetTimelineQuerySchema>
