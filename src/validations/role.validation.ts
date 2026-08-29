import { z } from 'zod'

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, 'Role name is required'),
  code: z
    .string()
    .trim()
    .min(1, 'Role code is required')
    .transform((val) => val.toUpperCase()),
  description: z.string().optional(),
})
