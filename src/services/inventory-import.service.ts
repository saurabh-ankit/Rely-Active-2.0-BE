import ExcelJS from 'exceljs'
import { Op, type Transaction } from 'sequelize'
import {
  InventoryCategory,
  InventoryCategoryLocation,
  InventoryFieldDefinition,
  InventoryFieldValue,
  InventoryItem,
  InventoryItemLocation,
  InventoryItemVendor,
  InventoryVendor,
  InventoryVendorLocation,
  Property,
} from '../models/index.js'
import { PACKAGE_TYPES, STOCK_UNITS } from '../enums/inventory.enum.js'
import { itemSchema, thresholdValuesSchema, validateFieldValue } from '../validations/inventory.validation.js'
import { InventoryError, inventoryWrite, saveItemInTransaction } from './inventory.service.js'

const fixedHeaders = [
  'Category',
  'Location*',
  'Supplier*',
  'Item Name*',
  'Package Type*',
  'Pack Quantity*',
  'Stock Unit*',
  'Min Quantity*',
  'Max Quantity*',
  'Threshold*',
]
const label = (name: string, id: string) => `${name} [${id}]`
const normalize = (name: string) => name.replace(/[ .,-]/g, '').toLowerCase()
const customHeader = (field: InventoryFieldDefinition) =>
  `${field.fieldLabel}${field.isRequired ? '*' : ''} [${field.id}]`
export class InventoryImportError extends InventoryError {
  constructor(public rows: string[]) {
    super(400, 'Correct the errors in the spreadsheet')
  }
}
async function context(categoryId: string, transaction: Transaction | null = null) {
  const category = await InventoryCategory.findByPk(categoryId, { transaction })
  if (!category) throw new InventoryError(404, 'Category not found')
  if (!category.isActive) throw new InventoryError(400, 'Select an active category')
  const assigned = await InventoryCategoryLocation.findAll({ where: { categoryId }, transaction })
  const locations = await Property.findAll({
    where: { id: { [Op.in]: assigned.map((x) => x.locationId) }, isActive: true, isDeleted: false },
    attributes: ['id', 'property_name'],
    transaction,
  })
  const links = await InventoryVendorLocation.findAll({
    where: { locationId: { [Op.in]: locations.map((x) => x.id) } },
    transaction,
  })
  const vendors = await InventoryVendor.findAll({
    where: { id: { [Op.in]: links.map((x) => x.vendorId) }, isActive: true },
    transaction,
  })
  const fields = await InventoryFieldDefinition.findAll({
    where: { categoryId },
    order: [
      ['displayOrder', 'ASC'],
      ['fieldName', 'ASC'],
    ],
    transaction,
  })
  return { category, locations, links, vendors, fields }
}
export async function inventoryTemplate(categoryId: string, rowCount: number) {
  const data = await context(categoryId)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Items')
  const choices = workbook.addWorksheet('Choices')
  const headers = [...fixedHeaders, ...data.fields.map(customHeader)]
  sheet.addRow(headers)
  sheet.getRow(1).font = { bold: true }
  const lists: Record<number, string[]> = {
    2: data.locations.map((x) => label(x.property_name, x.id)),
    3: data.vendors.map((x) => label(x.name, x.id)),
    5: [...PACKAGE_TYPES],
    7: [...STOCK_UNITS],
  }
  data.fields.forEach((f, i) => {
    if (f.fieldType === 'select') lists[i + 11] = f.enumValues
    if (f.fieldType === 'boolean') lists[i + 11] = ['TRUE', 'FALSE']
  })
  for (const [column, values] of Object.entries(lists)) {
    values.forEach((value, i) => {
      choices.getCell(i + 1, Number(column)).value = value
    })
    const letter = choices.getColumn(Number(column)).letter
    workbook.definedNames.add(`Choices!$${letter}$1:$${letter}$${Math.max(1, values.length)}`, `Options${column}`)
  }
  for (let i = 2; i <= rowCount + 1; i++) {
    sheet.getCell(i, 1).value = label(data.category.name, categoryId)
    for (let col = 2; col <= headers.length; col++) {
      const cell = sheet.getCell(i, col)
      cell.protection = { locked: false }
      if (lists[col])
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Options${col}`],
          showErrorMessage: true,
          error: 'Choose a listed value',
        }
    }
  }
  sheet.columns.forEach((c) => {
    c.width = 28
  })
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  choices.state = 'veryHidden'
  const instructions = workbook.addWorksheet('Instructions')
  instructions.addRow([
    'Enter whole package counts for min, max, and threshold. Pack Quantity is base units per package.',
  ])
  instructions.addRow([
    'Choose a supplier assigned to the selected location. Repeat an item row for additional locations/suppliers.',
  ])
  instructions.addRow([
    'Shared item details must match on repeated rows and when re-importing an existing item. Dates use YYYY-MM-DD.',
  ])
  instructions.getColumn(1).width = 120
  await sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true })
  return workbook.xlsx.writeBuffer()
}
function cellValue(cell: ExcelJS.Cell): string {
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10)
  if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error)
    throw new Error('Formulas and cell errors are not supported')
  return cell.text.trim()
}
export async function importInventoryItems(categoryId: string, buffer: Buffer, userId: string) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  } catch {
    throw new InventoryImportError(['Upload a valid .xlsx workbook'])
  }
  const sheet = workbook.getWorksheet('Items')
  if (!sheet) throw new InventoryImportError(['The Items worksheet is missing'])
  if (sheet.rowCount > 501) throw new InventoryImportError(['A maximum of 500 item rows is allowed'])
  return inventoryWrite(async (transaction) => {
    const data = await context(categoryId, transaction)
    const headers = [...fixedHeaders, ...data.fields.map(customHeader)]
    if (
      headers.some((header, index) => sheet.getCell(1, index + 1).text !== header) ||
      sheet.columnCount > headers.length
    )
      throw new InventoryImportError(['The template columns have changed. Download the current category template.'])
    const existing = await InventoryItem.findAll({ where: { categoryId }, transaction })
    const existingValues = await InventoryFieldValue.findAll({
      where: { itemId: { [Op.in]: existing.map((x) => x.id) } },
      transaction,
    })
    const errors: string[] = []
    type Parsed = {
      row: number
      key: string
      existingId?: string
      vendorId: string
      locationId: string
      item: ReturnType<typeof itemSchema.parse>
      thresholds: ReturnType<typeof thresholdValuesSchema.parse>
    }
    const parsed: Parsed[] = []
    const signatures = new Map<string, string>()
    const locationSignatures = new Map<string, string>()
    for (let row = 2; row <= sheet.rowCount; row++) {
      try {
        const cells = headers.map((_, i) => cellValue(sheet.getCell(row, i + 1)))
        if (cells.slice(1).every((x) => !x)) continue
        if (cells[0] !== label(data.category.name, categoryId)) throw new Error('Category does not match this template')
        const location = data.locations.find((x) => label(x.property_name, x.id) === cells[1])
        const vendor = data.vendors.find((x) => label(x.name, x.id) === cells[2])
        if (!location) throw new Error('Select a location assigned to this category')
        if (!vendor || !data.links.some((x) => x.vendorId === vendor.id && x.locationId === location.id))
          throw new Error('Select a supplier assigned to this location')
        if (!cells[3]) throw new Error('Item name is required')
        const packQuantity = Number(cells[5])
        const counts = cells.slice(7, 10).map((value) => (value === '' ? NaN : Number(value)))
        if (counts.some((x) => !Number.isInteger(x) || x < 0))
          throw new Error('Thresholds must be nonnegative whole package counts')
        const thresholds = thresholdValuesSchema.parse({
          minQuantity: counts[0]! * packQuantity,
          maxQuantity: counts[1]! * packQuantity,
          threshold: counts[2]! * packQuantity,
        })
        const customFields = data.fields.map((f, i) => {
          const raw = cells[i + 10] ?? ''
          const value =
            raw === ''
              ? f.defaultValue
              : f.fieldType === 'number'
                ? Number(raw)
                : f.fieldType === 'boolean'
                  ? raw.toUpperCase() === 'TRUE'
                    ? true
                    : raw.toUpperCase() === 'FALSE'
                      ? false
                      : raw
                  : raw
          const error = validateFieldValue(f, value)
          if (error) throw new Error(`${f.fieldLabel}: ${error}`)
          return { fieldDefinitionId: f.id, value }
        })
        const item = itemSchema.parse({
          name: cells[3],
          categoryId,
          packType: cells[4],
          packQuantity,
          packUnit: cells[6],
          ...thresholds,
          locationIds: [location.id],
          customFields,
        })
        const key = normalize(item.name)
        if (!key) throw new Error('Enter an item name containing letters or numbers')
        const matches = existing.filter((x) => normalize(x.name) === key)
        if (matches.length > 1)
          throw new Error('Multiple existing items match this name; resolve the duplicate before importing')
        const shared = JSON.stringify([item.packType, item.packQuantity, item.packUnit, customFields])
        if (signatures.has(key) && signatures.get(key) !== shared)
          throw new Error('Repeated item rows have conflicting package or custom-field details')
        signatures.set(key, shared)
        const previous = matches[0]
        if (previous) {
          if (!previous.isActive) throw new Error('This item is inactive; reactivate it before importing')
          const previousFields = data.fields.map((f) => ({
            fieldDefinitionId: f.id,
            value: existingValues.find((v) => v.itemId === previous.id && v.fieldDefinitionId === f.id)?.value ?? null,
          }))
          if (JSON.stringify([previous.packType, previous.packQuantity, previous.packUnit, previousFields]) !== shared)
            throw new Error('Shared details differ from the existing item; edit the item first')
        }
        const locationKey = `${key}:${location.id}`
        const thresholdSignature = JSON.stringify(thresholds)
        if (locationSignatures.has(locationKey) && locationSignatures.get(locationKey) !== thresholdSignature)
          throw new Error('Repeated rows have conflicting thresholds for the same location')
        locationSignatures.set(locationKey, thresholdSignature)
        parsed.push({
          row,
          key,
          ...(previous ? { existingId: previous.id } : {}),
          vendorId: vendor.id,
          locationId: location.id,
          item,
          thresholds,
        })
      } catch (error) {
        errors.push(`Row ${row}: ${error instanceof Error ? error.message : 'Invalid row'}`)
      }
    }
    if (errors.length) throw new InventoryImportError(errors)
    if (!parsed.length) throw new InventoryImportError(['No item rows found'])
    const itemIds = new Map<string, string>()
    let createdCount = 0
    for (const entry of parsed) {
      let itemId = entry.existingId ?? itemIds.get(entry.key)
      if (!itemId) {
        const created = await saveItemInTransaction(undefined, entry.item, userId, transaction)
        itemId = String(created.id)
        itemIds.set(entry.key, itemId)
        createdCount++
      }
      const location = await InventoryItemLocation.findOne({
        where: { itemId, locationId: entry.locationId },
        transaction,
      })
      if (location) await location.update({ ...entry.thresholds, updatedBy: userId }, { transaction })
      else
        await InventoryItemLocation.create(
          { itemId, locationId: entry.locationId, ...entry.thresholds, createdBy: userId, updatedBy: userId },
          { transaction },
        )
      const assignment = { itemId, vendorId: entry.vendorId, locationId: entry.locationId }
      if (!(await InventoryItemVendor.findOne({ where: assignment, transaction })))
        await InventoryItemVendor.create({ ...assignment, createdBy: userId, updatedBy: userId }, { transaction })
    }
    return {
      importedCount: parsed.length,
      createdCount,
      updatedCount: new Set(parsed.filter((x) => x.existingId).map((x) => x.existingId)).size,
    }
  })
}
