import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  categorySchema,
  vendorSchema,
  itemSchema,
  definitionSchema,
  locationsSchema,
  inventoryListSchema,
  validateFieldValue,
} from './inventory.validation.js'
describe('inventory validation', () => {
  it('rejects blank names, resident fields and invalid contacts', () => {
    expect(categorySchema.safeParse({ name: '  ' }).success).toBe(false)
    expect(categorySchema.safeParse({ name: 'Housekeeping', residentId: randomUUID() }).success).toBe(false)
    expect(vendorSchema.safeParse({ name: 'Vendor', email: 'bad' }).success).toBe(false)
    expect(vendorSchema.safeParse({ name: 'Vendor', phone: '123' }).success).toBe(false)
  })
  it('checks package pairs and integral base units', () => {
    const base = {
      name: 'Cleaner',
      categoryId: randomUUID(),
      packType: 'bottle',
      packUnit: 'ml',
      packQuantity: 500,
      locationIds: [randomUUID()],
      customFields: [],
    }
    expect(itemSchema.safeParse(base).success).toBe(true)
    expect(itemSchema.safeParse({ ...base, packQuantity: 0.5 }).success).toBe(false)
    expect(itemSchema.safeParse({ ...base, packUnit: 'tablet', packType: 'sack' }).success).toBe(false)
  })
  it('validates base-unit thresholds without defaulting omitted update fields', () => {
    const base = {
      name: 'Tablets',
      categoryId: randomUUID(),
      packType: 'strip',
      packUnit: 'tablet',
      packQuantity: 10,
      locationIds: [randomUUID()],
      customFields: [],
    }
    expect(itemSchema.parse(base)).not.toHaveProperty('minQuantity')
    expect(itemSchema.safeParse({ ...base, minQuantity: 0, maxQuantity: 0, threshold: 2147483647 }).success).toBe(true)
    for (const field of ['minQuantity', 'maxQuantity', 'threshold']) {
      for (const value of [-1, 0.5, NaN, Infinity, 2147483648, null])
        expect(itemSchema.safeParse({ ...base, [field]: value }).success).toBe(false)
    }
  })
  it('validates definitions, reserved keys and defaults', () => {
    const base = {
      fieldName: 'size',
      fieldLabel: 'Size',
      fieldType: 'select',
      isRequired: false,
      enumValues: ['S', 'M'],
      defaultValue: 'S',
    }
    expect(definitionSchema.safeParse(base).success).toBe(true)
    expect(definitionSchema.safeParse({ ...base, defaultValue: 'L' }).success).toBe(false)
    expect(definitionSchema.safeParse({ ...base, fieldName: 'packType' }).success).toBe(false)
    expect(definitionSchema.safeParse({ ...base, enumValues: ['S', 'S'] }).success).toBe(false)
  })
  it('keeps false and zero while rejecting impossible dates', () => {
    expect(validateFieldValue({ fieldType: 'boolean', isRequired: true, enumValues: [] }, false)).toBeNull()
    expect(validateFieldValue({ fieldType: 'number', isRequired: true, enumValues: [] }, 0)).toBeNull()
    expect(validateFieldValue({ fieldType: 'date', isRequired: false, enumValues: [] }, '2026-02-30')).not.toBeNull()
  })
  it('rejects duplicate IDs and unsafe sort/pagination values', () => {
    const id = randomUUID()
    expect(locationsSchema.safeParse({ locationIds: [id, id] }).success).toBe(false)
    expect(inventoryListSchema.safeParse({ limit: 1000 }).success).toBe(false)
    expect(inventoryListSchema.safeParse({ sortBy: 'name DESC; DROP TABLE' }).success).toBe(false)
    expect(inventoryListSchema.parse({ page: '2' }).page).toBe(2)
  })
})
