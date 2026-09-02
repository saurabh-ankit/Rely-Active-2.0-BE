import { z } from 'zod'

const positiveInt = z.union([z.number(), z.string()]).transform((val) => {
  if (val === undefined || val === null || val === '') return null
  const parsed = parseInt(String(val), 10)
  return Number.isNaN(parsed) ? null : parsed
})

const nonNegativeNumber = z.union([z.number(), z.string()]).transform((val) => {
  if (val === undefined || val === null || val === '') return 0
  const parsed = Number(val)
  return Number.isNaN(parsed) ? 0 : parsed
})

export const addOnServiceItemSchema = z.object({
  name: z.string().trim().min(1, 'Each add-on service must have a name'),
  quantity: positiveInt.refine((val) => val !== null && val >= 1, {
    message: 'Quantity must be at least 1',
  }),
  globalServiceId: z.string().optional(),
  price: nonNegativeNumber.optional(),
  imageUrl: z.string().optional(),
  keyFeatures: z.string().optional(),
})

export const createVenueSchema = z
  .object({
    name: z.string().trim().min(1, 'Venue name is required'),
    occupancy: positiveInt.refine((val) => val !== null && val > 0, {
      message: 'Occupancy must be greater than 0',
    }),
    price: nonNegativeNumber.optional(),
    keyFeatures: z.string().trim().min(1, 'Key features are required'),
    otherServices: z.string().optional().nullable(),
    images: z.any().optional(),
    addOnServices: z.any().optional(),
  })
  .passthrough()

export const updateVenueSchema = createVenueSchema.partial().passthrough()
