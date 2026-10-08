import { z } from 'zod'
import { PropertyEntityType, STRUCTURE_LEVEL_SETS, StructureLevel } from '../enums/propertyEntity.enum.js'
import { UnitType } from '../enums/propertyUnit.enum.js'

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/

export const createPropertySchema = z
  .object({
    companyId: z.string().optional().nullable(),
    property_name: z.string().trim().min(1, 'Property name is required'),
    /** Deprecated: send property_types. Still accepted from older clients. */
    property_type: z.enum(PropertyEntityType).optional().nullable(),
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
    property_types: z.array(z.enum(PropertyEntityType)).optional().nullable(),
    blocks: z.array(z.any()).optional().nullable(),
    entities: z
      .lazy(() => entitiesSchema)
      .optional()
      .nullable(),
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

// ─── Entity structure (nested JSON) ───────────────────────────────────────────

const optionalNumber = z.union([z.number(), z.string()]).optional().nullable()

const unitSchema = z
  .object({
    id: z.string().optional(),
    unit_number: z.string().trim().min(1, 'Unit number is required').max(50),
    unit_type: z.enum(UnitType).optional(),
    attributes: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .passthrough()

const floorSchema = z
  .object({
    id: z.string().optional(),
    floor_number: z.coerce.number().int(),
    floor_name: z.string().optional().nullable(),
    units: z.array(unitSchema).optional(),
  })
  .passthrough()

const bhkTemplateSchema = z
  .object({
    type: z.string(),
    carpet_area: z.coerce.number(),
    super_built_up_area: z.coerce.number(),
  })
  .passthrough()
  .superRefine((t, ctx) => {
    if (!(t.carpet_area > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['carpet_area'],
        message: `${t.type}: Carpet area should be greater than 0`,
      })
    }
    if (!(t.super_built_up_area > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['super_built_up_area'],
        message: `${t.type}: Super built-up area should be greater than 0`,
      })
    }
    if (t.carpet_area > 0 && t.super_built_up_area > 0 && t.carpet_area > t.super_built_up_area) {
      ctx.addIssue({
        code: 'custom',
        path: ['carpet_area'],
        message: `${t.type}: Carpet area can't be more than the super built-up area`,
      })
    }
  })

const blockSchema = z
  .object({
    id: z.string().optional(),
    block_name: z.string().trim().min(1, 'Block name is required').max(100),
    total_floors: optionalNumber,
    units_per_floor: optionalNumber,
    price_per_sqft: optionalNumber.refine(
      (v) => v === undefined || v === null || v === '' || Number(v) >= 0,
      "Price / sqft can't be negative",
    ),
    bhk_templates: z.array(bhkTemplateSchema).optional().nullable(),
    floors: z.array(floorSchema).optional(),
    units: z.array(unitSchema).optional(),
  })
  .passthrough()

const sameLevels = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

export const entitySchema = z
  .object({
    id: z.string().nullish(),
    entity_type: z.enum(PropertyEntityType),
    name: z.string().trim().min(1, 'Entity name is required').max(100),
    levels: z.array(z.enum(StructureLevel)),
    level_labels: z.partialRecord(z.enum(StructureLevel), z.string().trim().max(40)).optional().nullable(),
    settings: z.record(z.string(), z.unknown()).optional().nullable(),
    sort_order: z.number().int().optional(),
    blocks: z.array(blockSchema).optional(),
    floors: z.array(floorSchema).optional(),
    units: z.array(unitSchema).optional(),
  })
  .superRefine((entity, ctx) => {
    const levels = entity.levels
    if (!STRUCTURE_LEVEL_SETS.some((set) => sameLevels(set, levels))) {
      ctx.addIssue({
        code: 'custom',
        path: ['levels'],
        message: 'Levels must be one of: block→floor→unit, block→unit, floor→unit or unit',
      })
      return
    }
    // Children must sit at the entity's top level only.
    // Villas, duplexes and triplexes (a list of homes): sizes must be real so prices can be worked out.
    if (entity.entity_type !== PropertyEntityType.APARTMENT && sameLevels(levels, [StructureLevel.UNIT])) {
      for (const [i, unit] of (entity.units ?? []).entries()) {
        const plot = Number((unit as { built_up_area?: unknown }).built_up_area ?? 0)
        const carpet = Number((unit as { carpet_area?: unknown }).carpet_area ?? 0)
        if (entity.entity_type === PropertyEntityType.VILLA && !(plot > 0)) {
          ctx.addIssue({
            code: 'custom',
            path: ['units', i, 'built_up_area'],
            message: `${unit.unit_number}: Plot size should be greater than 0`,
          })
        }
        if (entity.entity_type !== PropertyEntityType.VILLA && !(carpet > 0)) {
          ctx.addIssue({
            code: 'custom',
            path: ['units', i, 'carpet_area'],
            message: `${unit.unit_number}: Carpet area should be greater than 0`,
          })
        }
      }
    }
    const top = levels[0]
    if (top !== StructureLevel.BLOCK && entity.blocks?.length) {
      ctx.addIssue({ code: 'custom', path: ['blocks'], message: `"${entity.name}" doesn't use blocks` })
    }
    if (top !== StructureLevel.FLOOR && entity.floors?.length) {
      ctx.addIssue({ code: 'custom', path: ['floors'], message: `"${entity.name}" doesn't list floors at the top` })
    }
    if (top !== StructureLevel.UNIT && entity.units?.length) {
      ctx.addIssue({ code: 'custom', path: ['units'], message: `"${entity.name}" doesn't list units at the top` })
    }
  })

export const entitiesSchema = z.array(entitySchema).superRefine((entities, ctx) => {
  // Unit numbers are how people find a flat, so they must be unique across the property.
  const seen = new Map<string, string>()
  entities.forEach((entity, eIdx) => {
    const units = [
      ...(entity.units ?? []),
      ...(entity.floors ?? []).flatMap((f) => f.units ?? []),
      ...(entity.blocks ?? []).flatMap((b) => [...(b.units ?? []), ...(b.floors ?? []).flatMap((f) => f.units ?? [])]),
    ]
    for (const unit of units) {
      const key = unit.unit_number.trim().toLowerCase()
      const owner = seen.get(key)
      if (owner) {
        ctx.addIssue({
          code: 'custom',
          path: [eIdx],
          message: `Unit "${unit.unit_number}" is used twice (${owner} and ${entity.name})`,
        })
      } else {
        seen.set(key, entity.name)
      }
    }
  })
})

export type EntityInput = z.infer<typeof entitySchema>
