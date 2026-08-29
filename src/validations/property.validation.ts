import { z } from 'zod'

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/

export const createPropertySchema = z
  .object({
    companyId: z.string().optional().nullable(),
    property_name: z.string().trim().min(1, 'Property name is required'),
    property_type: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    street: z.string().optional().nullable(),
    city: z.string().trim().min(1, 'City is required'),
    state: z.string().trim().min(1, 'State is required'),
    pincode: z.string().trim().regex(PINCODE_REGEX, 'Pincode must be exactly 6 digits'),
    country: z.string().optional().nullable(),
    total_area: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .refine((val) => val === undefined || val === null || val === '' || Number(val) > 0, {
        message: 'Total area must be a positive number',
      }),
    area_unit: z.string().optional().nullable(),
    amenities: z.any().optional().nullable(),
    launch_date: z.string().optional().nullable(),
    blocks: z.array(z.any()).optional().nullable(),
  })
  .passthrough()

export const updatePropertySchema = createPropertySchema.partial().passthrough()

export const addBlockSchema = z.object({
  block_name: z.string().trim().min(1, 'Block name is required'),
  total_floors: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .refine((val) => val === undefined || val === null || val === '' || Number(val) > 0, {
      message: 'Total floors must be a positive number',
    }),
  units_per_floor: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .refine((val) => val === undefined || val === null || val === '' || Number(val) > 0, {
      message: 'Units per floor must be a positive number',
    }),
  prefix: z.string().optional().nullable(),
  price_per_sqft: z.union([z.number(), z.string()]).optional().nullable(),
})
