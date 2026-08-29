import { z } from 'zod'

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/

export const createPropertySchema = z
  .object({
    companyId: z.string().optional(),
    property_name: z.string().trim().min(1, 'Property name is required'),
    property_type: z.string().optional(),
    description: z.string().optional(),
    street: z.string().optional(),
    city: z.string().trim().min(1, 'City is required'),
    state: z.string().trim().min(1, 'State is required'),
    pincode: z.string().trim().regex(PINCODE_REGEX, 'Pincode must be exactly 6 digits'),
    country: z.string().optional(),
    total_area: z
      .union([z.number(), z.string()])
      .optional()
      .refine((val) => val === undefined || val === null || val === '' || Number(val) > 0, {
        message: 'Total area must be a positive number',
      }),
    area_unit: z.string().optional(),
    amenities: z.any().optional(),
    launch_date: z.string().optional(),
    blocks: z.array(z.any()).optional(),
  })
  .passthrough()

export const updatePropertySchema = createPropertySchema.partial().passthrough()

export const addBlockSchema = z.object({
  block_name: z.string().trim().min(1, 'Block name is required'),
  total_floors: z
    .union([z.number(), z.string()])
    .optional()
    .refine((val) => val === undefined || val === null || val === '' || Number(val) > 0, {
      message: 'Total floors must be a positive number',
    }),
  units_per_floor: z
    .union([z.number(), z.string()])
    .optional()
    .refine((val) => val === undefined || val === null || val === '' || Number(val) > 0, {
      message: 'Units per floor must be a positive number',
    }),
  prefix: z.string().optional(),
  price_per_sqft: z.union([z.number(), z.string()]).optional(),
})
