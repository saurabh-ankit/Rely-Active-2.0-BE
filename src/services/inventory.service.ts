import { Op, fn, col, where as sqlWhere, Transaction, type Model, type ModelStatic, type WhereOptions } from 'sequelize'
import { z } from 'zod'
import {
  InventoryStock,
  InventoryPurchaseOrderLine,
  InventoryStockTransactionLine,
} from '../models/inventoryStock.model.js'
import sequelize from '../config/db/index.js'
import {
  InventoryCategory,
  InventoryVendor,
  InventoryItem,
  InventoryCategoryLocation,
  InventoryVendorLocation,
  InventoryItemLocation,
  InventoryItemVendor,
  InventoryFieldDefinition,
  InventoryFieldValue,
  Property,
} from '../models/index.js'
import {
  definitionSchema,
  itemSchema,
  inventoryListSchema,
  validateFieldValue,
  locationThresholdsSchema,
} from '../validations/inventory.validation.js'

export class InventoryError extends Error {
  constructor(
    public status: number,
    message: string,
    public field?: string,
  ) {
    super(message)
  }
}
export type InventoryKind = 'categories' | 'vendors' | 'items'
const masters: Record<InventoryKind, ModelStatic<Model>> = {
  categories: InventoryCategory,
  vendors: InventoryVendor,
  items: InventoryItem,
}
const links: Record<InventoryKind, { model: ModelStatic<Model>; key: string }> = {
  categories: { model: InventoryCategoryLocation, key: 'categoryId' },
  vendors: { model: InventoryVendorLocation, key: 'vendorId' },
  items: { model: InventoryItemLocation, key: 'itemId' },
}
const requireRow = async (model: ModelStatic<Model>, id: string, transaction: Transaction | null = null) => {
  const row = await model.findByPk(id, { transaction })
  if (!row) throw new InventoryError(404, 'Inventory record not found')
  return row
}
const activeRow = async (model: ModelStatic<Model>, id: string, transaction: Transaction) => {
  const row = await requireRow(model, id, transaction)
  if (!row.get('isActive')) throw new InventoryError(400, 'Select an active record')
  return row
}
export const inventoryWrite = <T>(fn: (transaction: Transaction) => Promise<T>) =>
  sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, fn)

export async function getInventoryDetail(kind: InventoryKind, id: string, transaction: Transaction | null = null) {
  const row = await requireRow(masters[kind], id, transaction)
  const link = links[kind]
  const locations = await link.model.findAll({ where: { [link.key]: id }, transaction })
  const extra =
    kind === 'categories'
      ? {
          fieldDefinitions: await InventoryFieldDefinition.findAll({
            where: { categoryId: id },
            order: [
              ['displayOrder', 'ASC'],
              ['fieldName', 'ASC'],
            ],
            transaction,
          }),
          itemCount: await InventoryItem.count({ where: { categoryId: id }, transaction }),
        }
      : kind === 'items'
        ? {
            locationThresholds: locations.map((x) => ({
              locationId: x.get('locationId'),
              minQuantity: x.get('minQuantity'),
              maxQuantity: x.get('maxQuantity'),
              threshold: x.get('threshold'),
            })),
            customFields: await InventoryFieldValue.findAll({ where: { itemId: id }, transaction }),
            vendorAssignments: await InventoryItemVendor.findAll({ where: { itemId: id }, transaction }),
          }
        : {}
  return { ...row.toJSON(), locationIds: locations.map((x) => x.get('locationId') as string), ...extra }
}
export async function listInventory(kind: InventoryKind, query: z.infer<typeof inventoryListSchema>) {
  const { page, limit, search, sortBy, sortOrder, categoryId, locationId, isActive, vendorId } = query
  const where: WhereOptions = {
    ...(kind === 'vendors' ? { isDeleted: false } : {}),
    ...(search
      ? {
          [Op.or]: (kind === 'vendors' ? ['name', 'contactPerson', 'email'] : ['name']).map((field) => ({
            [field]: { [Op.like]: `%${search.replace(/[\\%_]/g, '\\$&')}%` },
          })),
        }
      : {}),
    ...(isActive ? { isActive: isActive === 'true' } : {}),
    ...(kind === 'items' && categoryId ? { categoryId } : {}),
  }
  if (kind === 'items' && vendorId) {
    const assignments = await InventoryItemVendor.findAll({
      where: { vendorId, ...(locationId ? { locationId } : {}) },
    })
    Object.assign(where, { id: { [Op.in]: assignments.map((a) => a.itemId) } })
  }
  if (locationId) {
    const link = links[kind]
    const rows = await link.model.findAll({ where: { locationId } })
    const locationItemIds = rows.map((x) => x.get(link.key))
    const vendorItemIds = (where as { id?: { [Op.in]: unknown[] } }).id?.[Op.in]
    Object.assign(where, {
      id: { [Op.in]: vendorItemIds ? locationItemIds.filter((id) => vendorItemIds.includes(id)) : locationItemIds },
    })
  }
  const { rows, count } = await masters[kind].findAndCountAll({
    where,
    limit,
    offset: (page - 1) * limit,
    order: [
      [sortBy, sortOrder],
      ['id', 'ASC'],
    ],
  })
  const ids = rows.map((row) => row.get('id') as string)
  const link = links[kind]
  const [locations, definitions, counts, values, assignments] = await Promise.all([
    link.model.findAll({ where: { [link.key]: { [Op.in]: ids } } }),
    kind === 'categories'
      ? InventoryFieldDefinition.findAll({
          where: { categoryId: { [Op.in]: ids } },
          order: [
            ['displayOrder', 'ASC'],
            ['fieldName', 'ASC'],
          ],
        })
      : [],
    kind === 'categories'
      ? InventoryItem.findAll({
          attributes: ['categoryId', [fn('COUNT', col('id')), 'itemCount']],
          where: { categoryId: { [Op.in]: ids } },
          group: ['categoryId'],
        })
      : [],
    kind === 'items' ? InventoryFieldValue.findAll({ where: { itemId: { [Op.in]: ids } } }) : [],
    kind === 'items' ? InventoryItemVendor.findAll({ where: { itemId: { [Op.in]: ids } } }) : [],
  ])
  const records = rows.map((row) => {
    const id = row.get('id') as string
    return {
      ...row.toJSON(),
      locationIds: locations.filter((x) => x.get(link.key) === id).map((x) => x.get('locationId') as string),
      ...(kind === 'categories'
        ? {
            fieldDefinitions: definitions.filter((x) => x.categoryId === id),
            itemCount: Number(counts.find((x) => x.categoryId === id)?.get('itemCount') ?? 0),
          }
        : {}),
      ...(kind === 'items'
        ? {
            locationThresholds: locations
              .filter((x) => x.get(link.key) === id)
              .map((x) => ({
                locationId: x.get('locationId'),
                minQuantity: x.get('minQuantity'),
                maxQuantity: x.get('maxQuantity'),
                threshold: x.get('threshold'),
              })),
            customFields: values.filter((x) => x.itemId === id),
            vendorAssignments: assignments.filter((x) => x.itemId === id),
          }
        : {}),
    }
  })
  return { records, pagination: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) } }
}
export async function saveMaster(
  kind: 'categories' | 'vendors',
  id: string | undefined,
  data: Record<string, unknown>,
  userId: string,
) {
  const { fieldDefinitions, locationIds, ...attributes } = data as Record<string, unknown> & {
    fieldDefinitions?: (z.infer<typeof definitionSchema> & { id?: string })[]
    locationIds?: string[]
  }
  return inventoryWrite(async (transaction) => {
    if (kind === 'categories' && !(await categoryNameAvailable(String(attributes.name), id, transaction)).available)
      throw new InventoryError(409, 'Category with this name already exists', 'name')
    if (kind === 'vendors' && !id && !locationIds?.length)
      throw new InventoryError(400, 'At least one location is required', 'locationIds')
    const row = id
      ? await (
          await requireRow(masters[kind], id, transaction)
        ).update({ ...attributes, updatedBy: userId }, { transaction })
      : await masters[kind].create({ ...attributes, createdBy: userId, updatedBy: userId }, { transaction })
    const masterId = row.get('id') as string
    if (kind === 'categories' && fieldDefinitions !== undefined) {
      const ids = fieldDefinitions.flatMap((f) => (f.id ? [f.id] : []))
      if (
        new Set(ids).size !== ids.length ||
        new Set(fieldDefinitions.map((f) => f.fieldName.toLowerCase())).size !== fieldDefinitions.length
      )
        throw new InventoryError(400, 'Custom field names and IDs must be unique', 'fieldDefinitions')
      const existing = await InventoryFieldDefinition.findAll({ where: { categoryId: masterId }, transaction })
      if (ids.some((fieldId) => !existing.some((f) => f.id === fieldId)))
        throw new InventoryError(400, 'Custom fields must belong to this category', 'fieldDefinitions')
      for (const removed of existing.filter((f) => !ids.includes(f.id)))
        await deleteDefinitionInTransaction(masterId, removed.id, transaction)
      for (const [index, field] of fieldDefinitions.entries()) {
        const { id: fieldId, ...definition } = field
        try {
          await saveDefinitionInTransaction(masterId, fieldId, definition, userId, transaction)
        } catch (error) {
          if (error instanceof InventoryError)
            throw new InventoryError(
              error.status,
              error.message,
              `fieldDefinitions.${index}${error.field ? `.${error.field}` : ''}`,
            )
          throw error
        }
      }
    }
    if (kind === 'vendors' && locationIds !== undefined)
      await replaceLocations(kind, masterId, locationIds, userId, transaction)
    return getInventoryDetail(kind, masterId, transaction)
  })
}
async function validateLocations(ids: string[], transaction: Transaction) {
  const count = await Property.count({ where: { id: { [Op.in]: ids }, isActive: true, isDeleted: false }, transaction })
  if (count !== ids.length) throw new InventoryError(400, 'Select existing active properties', 'locationIds')
}
async function replaceLocations(
  kind: InventoryKind,
  id: string,
  locationIds: string[],
  userId: string,
  transaction: Transaction,
) {
  await validateLocations(locationIds, transaction)
  const link = links[kind]
  const current = await link.model.findAll({ where: { [link.key]: id }, transaction })
  const removed = current.map((x) => x.get('locationId') as string).filter((x) => !locationIds.includes(x))
  if (kind === 'categories' && removed.length) {
    const items = await InventoryItem.findAll({ where: { categoryId: id }, transaction })
    if (
      await InventoryItemLocation.count({
        where: { itemId: { [Op.in]: items.map((x) => x.id) }, locationId: { [Op.in]: removed } },
        transaction,
      })
    )
      throw new InventoryError(409, 'Remove dependent item locations before removing category locations', 'locationIds')
  }
  if (
    (kind === 'vendors' || kind === 'items') &&
    removed.length &&
    (await InventoryItemVendor.count({
      where: { [kind === 'vendors' ? 'vendorId' : 'itemId']: id, locationId: { [Op.in]: removed } },
      transaction,
    }))
  )
    throw new InventoryError(409, 'Remove dependent item/vendor assignments first', 'locationIds')
  if (kind === 'items') {
    const item = await InventoryItem.findByPk(id, { transaction })
    if (!item) throw new InventoryError(404, 'Item not found')
    const allowed = await InventoryCategoryLocation.findAll({ where: { categoryId: item.categoryId }, transaction })
    if (locationIds.some((x) => !allowed.some((a) => a.locationId === x)))
      throw new InventoryError(400, 'Item locations must be assigned to its category', 'locationIds')
  }
  if (removed.length)
    await link.model.destroy({ where: { [link.key]: id, locationId: { [Op.in]: removed } }, transaction })
  const defaultItem = kind === 'items' ? await InventoryItem.findByPk(id, { transaction }) : null
  const existing = current.map((x) => x.get('locationId'))
  await link.model.bulkCreate(
    locationIds
      .filter((x) => !existing.includes(x))
      .map((locationId) => ({
        [link.key]: id,
        locationId,
        ...(defaultItem
          ? {
              minQuantity: defaultItem.minQuantity,
              maxQuantity: defaultItem.maxQuantity,
              threshold: defaultItem.threshold,
            }
          : {}),
        createdBy: userId,
        updatedBy: userId,
      })),
    { transaction },
  )
}
export async function assignLocations(kind: InventoryKind, id: string, locationIds: string[], userId: string) {
  return inventoryWrite(async (transaction) => {
    await requireRow(masters[kind], id, transaction)
    if (kind === 'items' && !locationIds.length)
      throw new InventoryError(400, 'At least one location is required', 'locationIds')
    await replaceLocations(kind, id, locationIds, userId, transaction)
    return getInventoryDetail(kind, id, transaction)
  })
}
export async function saveItem(id: string | undefined, data: z.infer<typeof itemSchema>, userId: string) {
  return inventoryWrite((transaction) => saveItemInTransaction(id, data, userId, transaction))
}
export async function saveItemInTransaction(
  id: string | undefined,
  data: z.infer<typeof itemSchema>,
  userId: string,
  transaction: Transaction,
) {
  const { locationIds, customFields, ...attributes } = data
  const existing = id ? await InventoryItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }) : null
  if (id && !existing) throw new InventoryError(404, 'Item not found')
  if (
    existing &&
    (existing.packType !== data.packType ||
      existing.packUnit !== data.packUnit ||
      existing.packQuantity !== data.packQuantity)
  ) {
    const activity = await Promise.all([
      InventoryStock.count({ where: { itemId: existing.id }, transaction }),
      InventoryPurchaseOrderLine.count({ where: { itemId: existing.id }, transaction }),
      InventoryStockTransactionLine.count({ where: { itemId: existing.id }, transaction }),
    ])
    if (activity.some((count) => count > 0))
      throw new InventoryError(
        409,
        'Packaging cannot change after stock or purchase orders exist. Create a separate catalogue item for the new packaging.',
        'packQuantity',
      )
  }
  const minQuantity = data.minQuantity ?? existing?.minQuantity ?? 0
  const maxQuantity = data.maxQuantity ?? existing?.maxQuantity ?? 0
  if (maxQuantity < minQuantity) throw new InventoryError(400, 'Maximum must be at least minimum', 'maxQuantity')
  if (existing && existing.categoryId !== data.categoryId)
    throw new InventoryError(409, 'An existing item cannot change category', 'categoryId')
  if (data.isActive) await activeRow(InventoryCategory, data.categoryId, transaction)
  else await requireRow(InventoryCategory, data.categoryId, transaction)
  const definitions = await InventoryFieldDefinition.findAll({ where: { categoryId: data.categoryId }, transaction })
  if (customFields.some((f) => !definitions.some((d) => d.id === f.fieldDefinitionId)))
    throw new InventoryError(400, 'Custom fields must belong to the item category', 'customFields')
  const values = definitions.map((definition) => {
    const supplied = customFields.find((f) => f.fieldDefinitionId === definition.id)
    const value = supplied ? supplied.value : definition.defaultValue
    const error = validateFieldValue(definition, value)
    if (error) throw new InventoryError(400, `${definition.fieldLabel}: ${error}`, `customFields.${definition.id}`)
    return { fieldDefinitionId: definition.id, value }
  })
  const itemAttributes = {
    ...attributes,
    minQuantity,
    maxQuantity,
    threshold: data.threshold ?? existing?.threshold ?? 0,
    updatedBy: userId,
  }
  const item = existing
    ? await existing.update(itemAttributes, { transaction })
    : await InventoryItem.create({ ...itemAttributes, createdBy: userId }, { transaction })
  await replaceLocations('items', item.id, locationIds, userId, transaction)
  const locationRows = await InventoryItemLocation.findAll({ where: { itemId: item.id }, transaction })
  for (const location of locationRows) {
    const values = {
      minQuantity: data.minQuantity ?? location.minQuantity,
      maxQuantity: data.maxQuantity ?? location.maxQuantity,
      threshold: data.threshold ?? location.threshold,
    }
    if (values.maxQuantity < values.minQuantity)
      throw new InventoryError(400, 'Maximum must be at least minimum at every location', 'maxQuantity')
    if (data.minQuantity !== undefined || data.maxQuantity !== undefined || data.threshold !== undefined)
      await location.update({ ...values, updatedBy: userId }, { transaction })
  }
  await InventoryFieldValue.destroy({ where: { itemId: item.id }, transaction })
  await InventoryFieldValue.bulkCreate(
    values.map((v) => ({ ...v, itemId: item.id, createdBy: userId, updatedBy: userId })),
    { transaction },
  )
  return getInventoryDetail('items', item.id, transaction)
}
export async function saveItemVendors(
  id: string,
  assignments: { vendorId: string; locationId: string }[],
  userId: string,
) {
  return inventoryWrite(async (transaction) => {
    const item = await requireRow(InventoryItem, id, transaction)
    if (assignments.length) {
      await activeRow(InventoryItem, id, transaction)
      await activeRow(InventoryCategory, item.get('categoryId') as string, transaction)
    }
    for (const assignment of assignments) {
      await activeRow(InventoryVendor, assignment.vendorId, transaction)
      if (
        !(await InventoryItemLocation.count({
          where: { itemId: id, locationId: assignment.locationId },
          transaction,
        })) ||
        !(await InventoryVendorLocation.count({ where: assignment, transaction }))
      )
        throw new InventoryError(400, 'Vendor and item must both be assigned to the selected location', 'assignments')
    }
    await validateLocations([...new Set(assignments.map((a) => a.locationId))], transaction)
    await InventoryItemVendor.destroy({ where: { itemId: id }, transaction })
    await InventoryItemVendor.bulkCreate(
      assignments.map((a) => ({ ...a, itemId: id, createdBy: userId, updatedBy: userId })),
      { transaction },
    )
    return getInventoryDetail('items', id, transaction)
  })
}
export async function saveDefinition(
  categoryId: string,
  id: string | undefined,
  data: z.infer<typeof definitionSchema>,
  userId: string,
) {
  return inventoryWrite((transaction) => saveDefinitionInTransaction(categoryId, id, data, userId, transaction))
}
async function saveDefinitionInTransaction(
  categoryId: string,
  id: string | undefined,
  data: z.infer<typeof definitionSchema>,
  userId: string,
  transaction: Transaction,
) {
  await requireRow(InventoryCategory, categoryId, transaction)
  const existing = id ? await InventoryFieldDefinition.findOne({ where: { id, categoryId }, transaction }) : null
  if (id && !existing) throw new InventoryError(404, 'Field not found')
  const duplicate = await InventoryFieldDefinition.findOne({
    where: { categoryId, fieldName: data.fieldName, ...(id ? { id: { [Op.ne]: id } } : {}) },
    transaction,
  })
  if (duplicate) throw new InventoryError(409, 'Field name already exists in this category', 'fieldName')
  const items = await InventoryItem.findAll({ where: { categoryId }, transaction })
  if (existing) {
    const values = await InventoryFieldValue.findAll({ where: { fieldDefinitionId: id }, transaction })
    const populated = values.filter((v) => v.value !== null && v.value !== '')
    if (populated.length && (existing.fieldName !== data.fieldName || existing.fieldType !== data.fieldType))
      throw new InventoryError(409, 'Cannot rename or change the type of a populated field')
    if (values.some((v) => validateFieldValue(data, v.value)))
      throw new InventoryError(409, 'This change would invalidate existing item values')
    if (
      data.isRequired &&
      items.some((item) => !values.some((v) => v.itemId === item.id)) &&
      data.defaultValue === null
    )
      throw new InventoryError(409, 'Provide a valid default for existing items', 'defaultValue')
    await existing.update({ ...data, updatedBy: userId }, { transaction })
    for (const item of items.filter((item) => !values.some((v) => v.itemId === item.id)))
      await InventoryFieldValue.create(
        {
          itemId: item.id,
          fieldDefinitionId: existing.id,
          value: data.defaultValue,
          createdBy: userId,
          updatedBy: userId,
        },
        { transaction },
      )
    return existing
  }
  if (data.isRequired && items.length && data.defaultValue === null)
    throw new InventoryError(409, 'Provide a valid default for existing items', 'defaultValue')
  if ((await InventoryFieldDefinition.count({ where: { categoryId }, transaction })) >= 100) {
    throw new InventoryError(409, 'A category can have at most 100 custom fields')
  }
  const definition = await InventoryFieldDefinition.create(
    { ...data, categoryId, createdBy: userId, updatedBy: userId },
    { transaction },
  )
  await InventoryFieldValue.bulkCreate(
    items.map((item) => ({
      itemId: item.id,
      fieldDefinitionId: definition.id,
      value: data.defaultValue,
      createdBy: userId,
      updatedBy: userId,
    })),
    { transaction },
  )
  return definition
}
export async function deleteDefinition(categoryId: string, id: string) {
  return inventoryWrite((transaction) => deleteDefinitionInTransaction(categoryId, id, transaction))
}
async function deleteDefinitionInTransaction(categoryId: string, id: string, transaction: Transaction) {
  const definition = await InventoryFieldDefinition.findOne({ where: { id, categoryId }, transaction })
  if (!definition) throw new InventoryError(404, 'Field not found')
  const values = await InventoryFieldValue.findAll({ where: { fieldDefinitionId: id }, transaction })
  if (values.some((v) => v.value !== null && v.value !== ''))
    throw new InventoryError(409, 'Cannot delete a populated field')
  await InventoryFieldValue.destroy({ where: { fieldDefinitionId: id }, transaction })
  await definition.destroy({ transaction })
  return null
}

export async function categoryNameAvailable(
  name: string,
  excludeCategoryId?: string,
  transaction: Transaction | null = null,
) {
  const existing = await InventoryCategory.findOne({
    where: {
      [Op.and]: [
        sqlWhere(fn('LOWER', fn('TRIM', col('name'))), name.trim().toLowerCase()),
        ...(excludeCategoryId ? [{ id: { [Op.ne]: excludeCategoryId } }] : []),
      ],
    },
    transaction,
  })
  return { available: !existing }
}
export async function saveLocationThresholds(
  id: string,
  data: z.infer<typeof locationThresholdsSchema>,
  userId: string,
) {
  return inventoryWrite(async (transaction) => {
    await requireRow(InventoryItem, id, transaction)
    const locations = await InventoryItemLocation.findAll({ where: { itemId: id }, transaction })
    for (const [index, update] of data.locations.entries()) {
      const row = locations.find((x) => x.locationId === update.locationId)
      if (!row) throw new InventoryError(400, 'Item is not assigned to this location', `locations.${index}.locationId`)
      await row.update(
        {
          minQuantity: update.minQuantity,
          maxQuantity: update.maxQuantity,
          threshold: update.threshold,
          updatedBy: userId,
        },
        { transaction },
      )
    }
    return getInventoryDetail('items', id, transaction)
  })
}
export async function setVendorStatus(id: string, isActive: boolean, userId: string) {
  return inventoryWrite(async (transaction) => {
    const vendor = await requireRow(InventoryVendor, id, transaction)
    await vendor.update({ isActive, updatedBy: userId }, { transaction })
    return getInventoryDetail('vendors', id, transaction)
  })
}
