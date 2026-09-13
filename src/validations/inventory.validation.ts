import { z } from 'zod'
import { PACKAGE_TYPES, STOCK_UNITS, ALLOWED_UNITS_BY_PACKAGE_TYPE } from '../enums/inventory.enum.js'
import { PHONE_REGEX } from './company.validation.js'

const name = z.string().trim().min(1).max(255)
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const ids = z
  .array(z.uuid())
  .max(1000)
  .refine((v) => new Set(v).size === v.length, 'Duplicate locations are not allowed')
export const inventoryIdSchema = z.object({ id: z.uuid() })
export const inventoryFieldIdSchema = z.object({ id: z.uuid(), fieldId: z.uuid() })
export const inventoryListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().max(255).default(''),
    categoryId: z.uuid().optional(),
    locationId: z.uuid().optional(),
    vendorId: z.uuid().optional(),
    isActive: z.enum(['true', 'false']).optional(),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
    sortOrder: z.enum(['ASC', 'DESC']).default('ASC'),
  })
  .strict()
export const fieldValueSchema = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])
export const definitionSchema = z
  .object({
    fieldName: name
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Use letters, numbers and underscores, starting with a letter')
      .refine(
        (v) => !['name', 'packType', 'packUnit', 'packQuantity', 'categoryId', 'isActive'].includes(v),
        'This is a reserved item field',
      ),
    fieldLabel: name,
    fieldType: z.enum(['text', 'number', 'select', 'date', 'boolean']),
    isRequired: z.boolean(),
    defaultValue: fieldValueSchema.default(null),
    enumValues: z.array(name).max(100).default([]),
    displayOrder: z.number().int().min(0).max(10000).default(0),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.fieldType === 'select' && (!v.enumValues.length || new Set(v.enumValues).size !== v.enumValues.length))
      ctx.addIssue({ code: 'custom', path: ['enumValues'], message: 'Provide distinct select options' })
    if (v.fieldType !== 'select' && v.enumValues.length)
      ctx.addIssue({ code: 'custom', path: ['enumValues'], message: 'Only select fields can have options' })
    if (v.defaultValue !== null) {
      const error = validateFieldValue(v, v.defaultValue)
      if (error) ctx.addIssue({ code: 'custom', path: ['defaultValue'], message: error })
    }
  })
export const categorySchema = z
  .object({
    name: name.min(2, 'Category name must be at least 2 characters'),
    description: optionalText(10000),
    image: z
      .union([
        z
          .url()
          .max(500)
          .refine((v) => /^https?:\/\//i.test(v), 'Use an HTTP or HTTPS image URL'),
        z.literal(''),
      ])
      .nullable()
      .optional(),
    isActive: z.boolean().default(true),
    fieldDefinitions: z
      .array(definitionSchema.safeExtend({ id: z.uuid().optional() }))
      .max(100)
      .optional(),
  })
  .strict()
export const vendorSchema = z
  .object({
    name,
    contactPerson: name,
    email: z
      .union([z.email().max(255), z.literal('')])
      .nullable()
      .optional(),
    phone: z.string().trim().regex(PHONE_REGEX, 'Enter a valid 10-digit mobile number'),
    address: z.string().trim().min(1).max(10000),
    locationIds: ids.optional(),
    isActive: z.boolean().default(true),
  })
  .strict()
export const locationsSchema = z.object({ locationIds: ids }).strict()
export const itemVendorsSchema = z
  .object({
    assignments: z
      .array(z.object({ vendorId: z.uuid(), locationId: z.uuid() }).strict())
      .max(1000)
      .refine(
        (v) => new Set(v.map((x) => `${x.vendorId}:${x.locationId}`)).size === v.length,
        'Duplicate vendor assignments are not allowed',
      ),
  })
  .strict()
export const itemSchema = z
  .object({
    name,
    categoryId: z.uuid(),
    isActive: z.boolean().default(true),
    packType: z.enum(PACKAGE_TYPES),
    packUnit: z.enum(STOCK_UNITS),
    packQuantity: z.number().int().positive().max(2147483647),
    minQuantity: z.number().int().min(0).max(2147483647).optional(),
    maxQuantity: z.number().int().min(0).max(2147483647).optional(),
    threshold: z.number().int().min(0).max(2147483647).optional(),
    locationIds: ids.refine((v) => v.length > 0, 'At least one location is required'),
    customFields: z
      .array(z.object({ fieldDefinitionId: z.uuid(), value: fieldValueSchema }).strict())
      .max(100)
      .refine(
        (v) => new Set(v.map((x) => x.fieldDefinitionId)).size === v.length,
        'Duplicate custom fields are not allowed',
      ),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!ALLOWED_UNITS_BY_PACKAGE_TYPE[v.packType].includes(v.packUnit))
      ctx.addIssue({ code: 'custom', path: ['packUnit'], message: 'Unit is not valid for this package type' })
  })
export interface FieldRule {
  fieldType: string
  isRequired: boolean
  enumValues: string[]
}
export function validateFieldValue(field: FieldRule, value: unknown): string | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim()))
    return field.isRequired ? 'This field is required' : null
  switch (field.fieldType) {
    case 'text':
      return typeof value === 'string' ? null : 'Enter text'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'Enter a finite number'
    case 'boolean':
      return typeof value === 'boolean' ? null : 'Choose yes or no'
    case 'select':
      return typeof value === 'string' && field.enumValues.includes(value) ? null : 'Choose a valid option'
    case 'date':
      return typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value
        ? null
        : 'Enter a valid date'
    default:
      return 'Unsupported field type'
  }
}

export const categoryNameQuerySchema = z.object({ name: name.min(2), excludeCategoryId: z.uuid().optional() }).strict()
export const thresholdValuesSchema = z
  .object({
    minQuantity: z.number().int().min(0).max(2147483647),
    maxQuantity: z.number().int().min(0).max(2147483647),
    threshold: z.number().int().min(0).max(2147483647),
  })
  .strict()
  .refine((v) => v.maxQuantity >= v.minQuantity, { message: 'Maximum must be at least minimum', path: ['maxQuantity'] })
export const locationThresholdsSchema = z
  .object({
    locations: z
      .array(thresholdValuesSchema.safeExtend({ locationId: z.uuid() }))
      .max(1000)
      .refine((v) => new Set(v.map((x) => x.locationId)).size === v.length, 'Duplicate locations'),
  })
  .strict()
export const templateQuerySchema = z.object({ rowCount: z.coerce.number().int().min(1).max(500) }).strict()
