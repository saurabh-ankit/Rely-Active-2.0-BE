import { allocationAmount, sumAmounts, allocateFIFO } from './inventory-allocation.js'
import { createHash, randomUUID } from 'node:crypto'
import { Op, Transaction, where, col } from 'sequelize'
import sequelize from '../config/db/index.js'
import {
  InventoryCategory,
  InventoryCategoryLocation,
  InventoryItem,
  InventoryItemLocation,
  InventoryVendor,
  InventoryVendorLocation,
  InventoryItemVendor,
  InventoryFieldValue,
  InventoryFieldDefinition,
  Property,
  Resident,
  User,
  UserDetail,
  UserLocation,
  Role,
} from '../models/index.js'
import {
  InventoryIssueAllocation,
  InventoryStock,
  InventoryPurchaseOrder,
  InventoryPurchaseOrderLine,
  InventoryStockTransaction,
  InventoryStockTransactionLine,
} from '../models/inventoryStock.model.js'
import { requireInventoryAccess } from './center-inventory-access.service.js'
import { getInventoryDetail, saveItem, InventoryError } from './inventory.service.js'
import {
  WHOLE_PACKAGE_TYPES,
  type CenterListQuery,
  type PurchaseOrderInput,
  type ReceiptInput,
  type AssignmentInput,
} from '../validations/center-inventory.validation.js'

type Package = { packType: string; packUnit: string; packQuantity: number }
const fail = (message: string, status = 400): never => {
  throw new InventoryError(status, message)
}
export function stockDisplay(quantity: number, item: Package) {
  const packs = Math.floor(quantity / item.packQuantity)
  const remainder = quantity % item.packQuantity
  return `${packs} ${item.packType}${packs === 1 ? '' : 's'}${remainder ? ` + ${remainder} ${item.packUnit}` : ''}`
}
function assertQuantity(quantity: number, item: Package) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 4294967295)
    fail('Quantity must be a positive integer in base units')
  if ((WHOLE_PACKAGE_TYPES as readonly string[]).includes(item.packType) && quantity % item.packQuantity !== 0) {
    fail(`This item can only be moved in whole ${item.packType}s (${item.packQuantity} ${item.packUnit} each)`)
  }
}
const snapshot = (item: InventoryItem) => ({
  itemId: item.id,
  itemName: item.name,
  packType: item.packType,
  packUnit: item.packUnit,
  packQuantity: item.packQuantity,
})
const hash = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex')
const page = <T>(records: T[], query: CenterListQuery) => ({
  records: records.slice((query.page - 1) * query.limit, query.page * query.limit),
  pagination: {
    page: query.page,
    limit: query.limit,
    totalItems: records.length,
    totalPages: Math.ceil(records.length / query.limit),
  },
})
const matches = (value: string, search: string) => value.toLowerCase().includes(search.toLowerCase())
// Lock the existing property row before any inventory mutation. This also serializes
// first-time balance creation and independent POs receiving the same item.
async function write<T>(locationId: string, action: (transaction: Transaction) => Promise<T>) {
  return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async (transaction) => {
    const property = await Property.findByPk(locationId, { transaction, lock: transaction.LOCK.UPDATE })
    if (!property) fail('Property not found', 404)
    return action(transaction)
  })
}
async function requireItem(locationId: string, itemId: string, transaction?: Transaction, active = true) {
  const link = await InventoryItemLocation.findOne({ where: { locationId, itemId }, transaction: transaction ?? null })
  const item = await InventoryItem.findByPk(itemId, {
    transaction: transaction ?? null,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  })
  if (!link || !item) return fail('Item is not assigned to this property', 404)
  const category = await InventoryCategoryLocation.findOne({
    where: { locationId, categoryId: item.categoryId },
    transaction: transaction ?? null,
  })
  if (!category) fail('Item category is not assigned to this property', 404)
  if (active) {
    const master = await InventoryCategory.findByPk(item.categoryId, { transaction: transaction ?? null })
    if (!item.isActive || !master?.isActive) fail('Select an active item and category')
  }
  return { item, link }
}
async function requireSupplier(locationId: string, supplierId: string, transaction: Transaction) {
  const [vendor, link] = await Promise.all([
    InventoryVendor.findByPk(supplierId, { transaction }),
    InventoryVendorLocation.findOne({ where: { locationId, vendorId: supplierId }, transaction }),
  ])
  if (!vendor?.isActive || vendor.isDeleted || !link) fail('Select an active supplier assigned to this property')
}
async function requireItemSupplier(locationId: string, itemId: string, supplierId: string, transaction: Transaction) {
  if (!(await InventoryItemVendor.findOne({ where: { locationId, itemId, vendorId: supplierId }, transaction })))
    fail('The supplier is not assigned to this item at this property')
}
export async function centerCategories(locationId: string, query: CenterListQuery) {
  const [links, itemLinks] = await Promise.all([
    InventoryCategoryLocation.findAll({ where: { locationId } }),
    InventoryItemLocation.findAll({ where: { locationId } }),
  ])
  const [categories, items] = await Promise.all([
    InventoryCategory.findAll({ where: { id: { [Op.in]: links.map((l) => l.categoryId) } }, order: [['name', 'ASC']] }),
    InventoryItem.findAll({ where: { id: { [Op.in]: itemLinks.map((l) => l.itemId) } } }),
  ])
  return page(
    categories
      .filter((c) => matches(c.name, query.search))
      .map((c) => ({ ...c.toJSON(), itemCount: items.filter((i) => i.categoryId === c.id).length })),
    query,
  )
}
export async function centerCategory(locationId: string, id: string) {
  if (!(await InventoryCategoryLocation.findOne({ where: { locationId, categoryId: id } })))
    fail('Category not found at this property', 404)
  const category = await InventoryCategory.findByPk(id)
  if (!category) return fail('Category not found', 404)
  return {
    ...category.toJSON(),
    fieldDefinitions: await InventoryFieldDefinition.findAll({
      where: { categoryId: id },
      order: [['displayOrder', 'ASC']],
    }),
  }
}
export async function centerItems(locationId: string, query: CenterListQuery, paginate = true) {
  const links = await InventoryItemLocation.findAll({ where: { locationId } })
  const [items, stocks, assignments, suppliers, values] = await Promise.all([
    InventoryItem.findAll({
      where: {
        id: { [Op.in]: links.map((l) => l.itemId) },
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      order: [['name', 'ASC']],
    }),
    InventoryStock.findAll({ where: { locationId } }),
    InventoryItemVendor.findAll({ where: { locationId } }),
    InventoryVendor.findAll({
      where: {
        id: { [Op.in]: (await InventoryVendorLocation.findAll({ where: { locationId } })).map((l) => l.vendorId) },
      },
    }),
    InventoryFieldValue.findAll({ where: { itemId: { [Op.in]: links.map((l) => l.itemId) } } }),
  ])
  const stockMap = new Map(stocks.map((s) => [s.itemId, s.quantity]))
  const records = items
    .map((item) => {
      const link = links.find((l) => l.itemId === item.id)!
      const quantity = stockMap.get(item.id) ?? 0
      const itemSuppliers = suppliers
        .filter((s) => !s.isDeleted && assignments.some((a) => a.itemId === item.id && a.vendorId === s.id))
        .map((s) => s.toJSON())
      return {
        ...item.toJSON(),
        minQuantity: link.minQuantity,
        maxQuantity: link.maxQuantity,
        threshold: link.threshold,
        quantity,
        stockDisplay: stockDisplay(quantity, item),
        suppliers: itemSuppliers,
        customFields: values.filter((v) => v.itemId === item.id).map((v) => v.toJSON()),
        wholePackagesOnly: (WHOLE_PACKAGE_TYPES as readonly string[]).includes(item.packType),
      }
    })
    .filter(
      (item) =>
        matches(item.name, query.search) &&
        (!query.supplierId || item.suppliers.some((s) => s.id === query.supplierId)) &&
        (!query.itemId || item.id === query.itemId) &&
        (!query.stockFilter ||
          (query.stockFilter === 'out_of_stock'
            ? item.quantity === 0
            : query.stockFilter === 'below_min'
              ? item.quantity < item.minQuantity
              : item.quantity >= item.minQuantity && item.quantity < item.threshold)),
    )
  return paginate
    ? page(records, query)
    : { records, pagination: { page: 1, limit: records.length, totalItems: records.length, totalPages: 1 } }
}
export async function centerItem(locationId: string, id: string, query: CenterListQuery) {
  await requireItem(locationId, id, undefined, false)
  const items = await centerItems(locationId, { ...query, itemId: id, search: '' })
  const item = items.records[0]
  if (!item) return fail('Item not found', 404)
  const batches = await remainingReceipts(locationId, id)
  return { ...item, batches: batches.map((b) => ({ ...b, stockDisplay: stockDisplay(b.remainingQuantity, b) })) }
}
export async function centerSuppliers(locationId: string, query: CenterListQuery) {
  const links = await InventoryVendorLocation.findAll({ where: { locationId } })
  let ids = links.map((l) => l.vendorId)
  if (query.categoryId) {
    const items = await InventoryItem.findAll({ where: { categoryId: query.categoryId }, attributes: ['id'] })
    const assignments = await InventoryItemVendor.findAll({
      where: { locationId, itemId: { [Op.in]: items.map((i) => i.id) } },
    })
    ids = ids.filter((id) => assignments.some((a) => a.vendorId === id))
  }
  const rows = await InventoryVendor.findAll({
    where: { id: { [Op.in]: ids }, isDeleted: false },
    order: [['name', 'ASC']],
  })
  const orders = await InventoryPurchaseOrder.findAll({ where: { locationId, supplierId: { [Op.in]: ids } } })
  const records = rows
    .filter(
      (s) =>
        matches(`${s.name} ${s.contactPerson ?? ''} ${s.email ?? ''}`, query.search) &&
        (!query.isActive || s.isActive === (query.isActive === 'true')),
    )
    .map((s) => ({ ...s.toJSON(), purchaseOrderCount: orders.filter((o) => o.supplierId === s.id).length }))
  return {
    ...page(records, query),
    summary: {
      totalSuppliers: rows.length,
      activeSuppliers: rows.filter((s) => s.isActive).length,
      inactiveSuppliers: rows.filter((s) => !s.isActive).length,
      totalPurchaseOrders: orders.length,
    },
  }
}
export async function centerStats(locationId: string, query: CenterListQuery) {
  const { records } = await centerItems(locationId, { ...query, search: '' }, false)
  const ids = new Set(records.map((i) => i.id))
  const transactions = await InventoryStockTransaction.findAll({
    where: { locationId },
    attributes: ['id', 'transactionType'],
  })
  const lines = await InventoryStockTransactionLine.findAll({
    where: { transactionId: { [Op.in]: transactions.map((t) => t.id) } },
  })
  const remaining = (await remainingReceipts(locationId)).filter((l) => ids.has(l.itemId) && l.remainingQuantity > 0)
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  const scoped = lines.filter((l) => ids.has(l.itemId))
  const transactionIds = new Set(scoped.map((l) => l.transactionId))
  return {
    totalItems: records.length,
    lowStockItems: records.filter((i) => i.quantity < i.threshold).length,
    outOfStockItems: records.filter((i) => i.quantity === 0).length,
    expiringSoon: new Set(
      remaining.filter((l) => l.expiryDate && l.expiryDate >= today && l.expiryDate <= soon).map((l) => l.itemId),
    ).size,
    totalValue: sumAmounts(remaining.map((l) => allocationAmount(l.remainingQuantity, l.packQuantity, l.unitCost))),
    totalTransactions: transactionIds.size,
    totalPurchases: transactions.filter((t) => transactionIds.has(t.id) && t.transactionType === 'purchase').length,
    totalIssues: transactions.filter((t) => transactionIds.has(t.id) && t.transactionType === 'issue').length,
  }
}
export async function setCenterThresholds(
  locationId: string,
  id: string,
  data: { minQuantity: number; maxQuantity: number; threshold: number },
  userId: string,
) {
  return write(locationId, async (transaction) => {
    const { link } = await requireItem(locationId, id, transaction, false)
    await link.update({ ...data, updatedBy: userId }, { transaction })
    return link.toJSON()
  })
}
export async function setCenterSuppliers(locationId: string, id: string, supplierIds: string[], userId: string) {
  return write(locationId, async (transaction) => {
    await requireItem(locationId, id, transaction, false)
    for (const supplierId of new Set(supplierIds)) await requireSupplier(locationId, supplierId, transaction)
    await InventoryItemVendor.destroy({ where: { locationId, itemId: id }, transaction })
    await InventoryItemVendor.bulkCreate(
      [...new Set(supplierIds)].map((vendorId) => ({
        locationId,
        itemId: id,
        vendorId,
        createdBy: userId,
        updatedBy: userId,
      })),
      { transaction },
    )
    return { supplierIds }
  })
}
async function getPO(locationId: string, id: string, transaction?: Transaction) {
  const po = await InventoryPurchaseOrder.findOne({ where: { id, locationId }, transaction: transaction ?? null })
  if (!po) return fail('Purchase order not found at this property', 404)
  return po
}
export async function purchaseOrderDetail(locationId: string, id: string) {
  const po = await getPO(locationId, id)
  const [items, supplier, receipts] = await Promise.all([
    InventoryPurchaseOrderLine.findAll({ where: { purchaseOrderId: id } }),
    InventoryVendor.findByPk(po.supplierId),
    InventoryStockTransaction.findAll({ where: { purchaseOrderId: id, locationId }, order: [['createdAt', 'DESC']] }),
  ])
  return {
    ...po.toJSON(),
    supplier: supplier?.toJSON(),
    items: items.map((i) => ({
      ...i.toJSON(),
      remainingQuantity: i.orderedQuantity - i.receivedQuantity,
      orderedDisplay: stockDisplay(i.orderedQuantity, i),
      receivedDisplay: stockDisplay(i.receivedQuantity, i),
    })),
    totalAmount: items.reduce((sum, i) => sum + (i.orderedQuantity / i.packQuantity) * Number(i.agreedPrice), 0),
    receipts: receipts.map((r) => r.toJSON()),
  }
}
export async function listPurchaseOrders(locationId: string, query: CenterListQuery) {
  const orders = await InventoryPurchaseOrder.findAll({
    where: {
      locationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    },
    order: [[['poNumber', 'status', 'createdAt'].includes(query.sortBy) ? query.sortBy : 'createdAt', query.sortOrder]],
  })
  const [lines, suppliers, categoryItems] = await Promise.all([
    InventoryPurchaseOrderLine.findAll({ where: { purchaseOrderId: { [Op.in]: orders.map((o) => o.id) } } }),
    InventoryVendor.findAll({ where: { id: { [Op.in]: orders.map((o) => o.supplierId) } } }),
    query.categoryId ? InventoryItem.findAll({ where: { categoryId: query.categoryId }, attributes: ['id'] }) : [],
  ])
  const records = orders
    .map((o) => {
      const items = lines.filter((l) => l.purchaseOrderId === o.id)
      return {
        ...o.toJSON(),
        supplier: suppliers.find((s) => s.id === o.supplierId)?.toJSON(),
        itemCount: items.length,
        totalAmount: items.reduce((sum, l) => sum + (l.orderedQuantity / l.packQuantity) * Number(l.agreedPrice), 0),
      }
    })
    .filter(
      (o) =>
        matches(`${o.poNumber} ${o.supplier?.name ?? ''}`, query.search) &&
        (!query.categoryId ||
          lines.some((l) => l.purchaseOrderId === o.id && categoryItems.some((i) => i.id === l.itemId))) &&
        (!query.startDate || o.createdAt!.toISOString().slice(0, 10) >= query.startDate) &&
        (!query.endDate || o.createdAt!.toISOString().slice(0, 10) <= query.endDate),
    )
  return page(records, query)
}
export async function savePurchaseOrder(
  locationId: string,
  input: PurchaseOrderInput,
  userId: string,
  autoApprove: boolean,
  id?: string,
) {
  const poId = await write(locationId, async (transaction) => {
    const requestHash = hash(input)
    if (!id) {
      const previous = await InventoryPurchaseOrder.findOne({
        where: { locationId, requestId: input.requestId },
        transaction,
      })
      if (previous) {
        if (previous.requestHash !== requestHash)
          fail('Request ID was already used for a different purchase order', 409)
        return previous.id
      }
    }
    const existing = id ? await getPO(locationId, id, transaction) : null
    if (existing && !['draft', 'approval_pending', 'approved'].includes(existing.status))
      fail('This purchase order can no longer be edited')
    await requireSupplier(locationId, input.supplierId, transaction)
    const items = []
    for (const line of [...input.items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
      const { item, link } = await requireItem(locationId, line.itemId, transaction)
      await requireItemSupplier(locationId, item.id, input.supplierId, transaction)
      assertQuantity(line.orderedQuantity, item)
      if (line.orderedQuantity % item.packQuantity !== 0) fail('Purchase orders must contain whole packages')
      const stock = await InventoryStock.findOne({ where: { locationId, itemId: item.id }, transaction })
      if (link.maxQuantity > 0 && (stock?.quantity ?? 0) + line.orderedQuantity > link.maxQuantity)
        fail(`${item.name}: order exceeds maximum stock capacity`)
      items.push({
        ...snapshot(item),
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: 0,
        agreedPrice: line.agreedPrice,
      })
    }
    const po =
      existing ??
      (await InventoryPurchaseOrder.create(
        {
          locationId,
          supplierId: input.supplierId,
          poNumber: `PO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: autoApprove ? 'approved' : 'approval_pending',
          notes: input.notes ?? null,
          requestId: input.requestId,
          requestHash,
          createdBy: userId,
          updatedBy: userId,
        },
        { transaction },
      ))
    if (existing) {
      if (await InventoryStockTransaction.count({ where: { purchaseOrderId: po.id }, transaction }))
        fail('An order with receipts cannot be edited')
      await po.update({ supplierId: input.supplierId, notes: input.notes ?? null, updatedBy: userId }, { transaction })
      await InventoryPurchaseOrderLine.destroy({ where: { purchaseOrderId: po.id }, transaction })
    }
    await InventoryPurchaseOrderLine.bulkCreate(
      items.map((i) => ({ ...i, purchaseOrderId: po.id, createdBy: userId, updatedBy: userId })),
      { transaction },
    )
    return po.id
  })
  return purchaseOrderDetail(locationId, poId)
}
export async function decidePurchaseOrder(
  locationId: string,
  id: string,
  action: 'approve' | 'reject',
  userId: string,
) {
  await write(locationId, async (transaction) => {
    const po = await getPO(locationId, id, transaction)
    if (po.status !== 'approval_pending') fail('Only orders awaiting approval can be approved or rejected')
    await po.update({ status: action === 'approve' ? 'approved' : 'cancelled', updatedBy: userId }, { transaction })
  })
  return purchaseOrderDetail(locationId, id)
}
export async function deletePurchaseOrder(locationId: string, id: string) {
  return write(locationId, async (transaction) => {
    const po = await getPO(locationId, id, transaction)
    if (!['draft', 'approval_pending'].includes(po.status))
      fail('Only draft orders or orders awaiting approval can be deleted')
    await InventoryPurchaseOrderLine.destroy({ where: { purchaseOrderId: id }, transaction })
    await po.destroy({ transaction })
    return { id }
  })
}
export async function receiveStock(locationId: string, input: ReceiptInput, userId: string, purchaseOrderId?: string) {
  const id = await write(locationId, async (transaction) => {
    const requestHash = hash({ ...input, purchaseOrderId: purchaseOrderId ?? null })
    const previous = await InventoryStockTransaction.findOne({
      where: { locationId, requestId: input.requestId },
      transaction,
    })
    if (previous) {
      if (previous.requestHash !== requestHash) fail('Request ID was already used for a different receipt', 409)
      return previous.id
    }
    const po = purchaseOrderId ? await getPO(locationId, purchaseOrderId, transaction) : null
    if (po && !['approved', 'partially_received'].includes(po.status))
      fail('Only approved or partially received orders can receive stock')
    const supplierId = po?.supplierId ?? input.supplierId
    if (!supplierId) return fail('Supplier is required')
    if (po && input.supplierId && input.supplierId !== po.supplierId)
      fail('Supplier does not match this purchase order')
    await requireSupplier(locationId, supplierId, transaction)
    const poLines = po
      ? await InventoryPurchaseOrderLine.findAll({ where: { purchaseOrderId: po.id }, transaction })
      : []
    const record = await InventoryStockTransaction.create(
      {
        locationId,
        supplierId,
        purchaseOrderId: po?.id ?? null,
        transactionNumber: `ST-${randomUUID().slice(0, 8).toUpperCase()}`,
        transactionType: 'purchase',
        date: input.date,
        notes: input.notes ?? null,
        requestId: input.requestId,
        requestHash,
        createdBy: userId,
        updatedBy: userId,
      },
      { transaction },
    )
    for (const entry of [...input.stockEntries].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
      const { item, link } = await requireItem(locationId, entry.itemId, transaction)
      await requireItemSupplier(locationId, item.id, supplierId, transaction)
      const poLine = poLines.find((l) => l.itemId === item.id)
      if (po && !poLine) fail('Received item is not in this purchase order')
      if (po && !entry.transitId) fail('Transit ID is required for PO receipts')
      if (
        poLine &&
        (poLine.packQuantity !== item.packQuantity ||
          poLine.packUnit !== item.packUnit ||
          poLine.packType !== item.packType)
      )
        fail('Item packaging changed since this order was created; correct the catalogue before receiving')
      assertQuantity(entry.quantity, item)
      if (poLine && poLine.receivedQuantity + entry.quantity > poLine.orderedQuantity)
        fail(`${item.name}: quantity exceeds the outstanding order quantity`)
      const [balance] = await InventoryStock.findOrCreate({
        where: { locationId, itemId: item.id },
        defaults: { locationId, itemId: item.id, quantity: 0, createdBy: userId, updatedBy: userId },
        transaction,
      })
      const next = balance.quantity + entry.quantity
      if (next > 4294967295) fail('Stock exceeds supported quantity')
      if (link.maxQuantity > 0 && next > link.maxQuantity) fail(`${item.name}: receipt exceeds maximum stock capacity`)
      await balance.update({ quantity: next, updatedBy: userId }, { transaction })
      if (poLine)
        await poLine.update(
          { receivedQuantity: poLine.receivedQuantity + entry.quantity, updatedBy: userId },
          { transaction },
        )
      await InventoryStockTransactionLine.create(
        {
          ...snapshot(item),
          transactionId: record.id,
          quantity: entry.quantity,
          unitCost: poLine ? Number(poLine.agreedPrice) : entry.unitCost,
          mrpPrice: entry.mrpPrice,
          batchNumber: entry.batchNumber ?? null,
          transitId: entry.transitId ?? null,
          receivedDate: entry.receivedDate,
          manufacturedDate: entry.manufacturedDate ?? null,
          expiryDate: entry.expiryDate ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
        { transaction },
      )
    }
    if (po)
      await po.update(
        {
          status: poLines.every((l) => l.receivedQuantity === l.orderedQuantity) ? 'received' : 'partially_received',
          updatedBy: userId,
        },
        { transaction },
      )
    return record.id
  })
  return stockTransactionDetail(locationId, id)
}
export async function stockTransactionDetail(locationId: string, id: string) {
  const record = await InventoryStockTransaction.findOne({ where: { locationId, id } })
  if (!record) return fail('Transaction not found at this property', 404)
  const [items, supplier, po] = await Promise.all([
    InventoryStockTransactionLine.findAll({ where: { transactionId: id } }),
    record.supplierId ? InventoryVendor.findByPk(record.supplierId) : null,
    record.purchaseOrderId ? getPO(locationId, record.purchaseOrderId) : null,
  ])
  const allocations = await InventoryIssueAllocation.findAll({
    where: { issueLineId: { [Op.in]: items.map((i) => i.id) } },
  })
  const pricedItems = items.map((i) => ({
    ...i.toJSON(),
    stockDisplay: stockDisplay(i.quantity, i),
    mrpAmount:
      record.transactionType === 'issue'
        ? (allocations.find((a) => a.issueLineId === i.id)?.mrpAmount ?? null)
        : allocationAmount(i.quantity, i.packQuantity, i.mrpPrice),
    receiptLineId: allocations.find((a) => a.issueLineId === i.id)?.receiptLineId ?? null,
  }))
  return {
    ...record.toJSON(),
    mrpAmount: pricedItems.some((i) => i.mrpAmount === null) ? null : sumAmounts(pricedItems.map((i) => i.mrpAmount!)),
    supplier: supplier?.toJSON(),
    poNumber: po?.poNumber ?? null,
    items: pricedItems,
    totalAmount: items.reduce((sum, i) => sum + (i.quantity / i.packQuantity) * Number(i.unitCost), 0),
  }
}
export async function listStockTransactions(locationId: string, query: CenterListQuery) {
  const records = await InventoryStockTransaction.findAll({
    where: { locationId, ...(query.supplierId ? { supplierId: query.supplierId } : {}) },
    order: [
      ['date', query.sortOrder],
      ['createdAt', query.sortOrder],
    ],
  })
  const [lines, suppliers, categoryItems] = await Promise.all([
    InventoryStockTransactionLine.findAll({ where: { transactionId: { [Op.in]: records.map((r) => r.id) } } }),
    InventoryVendor.findAll({
      where: { id: { [Op.in]: records.map((r) => r.supplierId).filter((id): id is string => !!id) } },
    }),
    query.categoryId ? InventoryItem.findAll({ where: { categoryId: query.categoryId }, attributes: ['id'] }) : [],
  ])
  const allocations = await InventoryIssueAllocation.findAll({
    where: { issueLineId: { [Op.in]: lines.map((l) => l.id) } },
  })
  const mrpTotal = (r: InventoryStockTransaction) => {
    const values = lines
      .filter((l) => l.transactionId === r.id)
      .map((l) =>
        r.transactionType === 'issue'
          ? (allocations.find((a) => a.issueLineId === l.id)?.mrpAmount ?? null)
          : allocationAmount(l.quantity, l.packQuantity, l.mrpPrice),
      )
    return values.some((v) => v === null) ? null : sumAmounts(values as number[])
  }
  return page(
    records
      .map((r) => ({
        ...r.toJSON(),
        supplier: suppliers.find((s) => s.id === r.supplierId)?.toJSON(),
        itemCount: new Set(lines.filter((l) => l.transactionId === r.id).map((l) => l.itemId)).size,
        mrpAmount: mrpTotal(r),
        totalAmount: lines
          .filter((l) => l.transactionId === r.id)
          .reduce((sum, l) => sum + (l.quantity / l.packQuantity) * Number(l.unitCost), 0),
      }))
      .filter(
        (r) =>
          matches(`${r.transactionNumber} ${r.supplier?.name ?? ''} ${r.recipientName ?? ''}`, query.search) &&
          (!query.startDate || r.date >= query.startDate) &&
          (!query.endDate || r.date <= query.endDate) &&
          (!query.categoryId ||
            lines.some((l) => l.transactionId === r.id && categoryItems.some((i) => i.id === l.itemId))) &&
          (!query.itemId || lines.some((l) => l.transactionId === r.id && l.itemId === query.itemId)),
      ),
    query,
  )
}

export async function updateCenterSupplier(
  locationId: string,
  id: string,
  data: {
    name: string
    contactPerson: string
    email?: string | null | undefined
    phone: string
    address: string
    isActive: boolean
  },
  userId: string,
) {
  const links = await InventoryVendorLocation.findAll({ where: { vendorId: id } })
  if (!links.some((l) => l.locationId === locationId)) fail('Supplier not found at this property', 404)
  // Supplier profiles are shared catalogue data: require permission everywhere
  // the edit will take effect, rather than silently modifying another property.
  for (const link of links) await requireInventoryAccess(userId, link.locationId, 'update')
  return write(locationId, async (transaction) => {
    const supplier = await InventoryVendor.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
    if (!supplier || supplier.isDeleted) return fail('Supplier not found', 404)
    await supplier.update({ ...data, email: data.email ?? null, updatedBy: userId }, { transaction })
    return supplier.toJSON()
  })
}
export async function removeCenterSupplier(locationId: string, id: string, userId: string) {
  const links = await InventoryVendorLocation.findAll({ where: { vendorId: id } })
  if (!links.some((link) => link.locationId === locationId)) fail('Supplier not found at this property', 404)
  for (const link of links) await requireInventoryAccess(userId, link.locationId, 'delete')
  return write(locationId, async (transaction) => {
    const supplier = await InventoryVendor.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
    if (!supplier || supplier.isDeleted) return fail('Supplier not found', 404)
    // Assist uses soft deletion. Retain the master and assignments for historical
    // order/receipt references; all selectors and writes exclude deleted vendors.
    await supplier.update({ isActive: false, isDeleted: true, updatedBy: userId }, { transaction })
    return { id }
  })
}

export async function centerItemEditor(locationId: string, id: string, userId: string) {
  const { item } = await requireItem(locationId, id, undefined, false)
  const links = await InventoryItemLocation.findAll({ where: { itemId: id } })
  for (const link of links) await requireInventoryAccess(userId, link.locationId, 'update')
  const [record, category, locations] = await Promise.all([
    getInventoryDetail('items', id),
    getInventoryDetail('categories', item.categoryId),
    Property.findAll({
      where: { id: { [Op.in]: links.map((l) => l.locationId) } },
      attributes: ['id', 'property_name'],
    }),
  ])
  return { record, category, locations: locations.map((p) => ({ id: p.id, name: p.property_name })) }
}
export async function saveCenterItem(
  locationId: string,
  id: string,
  input: Parameters<typeof saveItem>[1],
  userId: string,
) {
  const editor = await centerItemEditor(locationId, id, userId)
  const assigned = editor.locations.map((l) => l.id).sort()
  if (JSON.stringify([...input.locationIds].sort()) !== JSON.stringify(assigned))
    fail('Manage location assignments in Global Settings')
  return saveItem(id, input, userId)
}

// Only purchase lines are receipt stock. Legacy issues without allocations are
// intentionally not inferred: reconciliation blocks new issues until reviewed.
export async function remainingReceipts(locationId: string, itemId?: string, transaction?: Transaction) {
  const headers = await InventoryStockTransaction.findAll({
    where: { locationId, transactionType: 'purchase' },
    attributes: ['id'],
    transaction: transaction ?? null,
  })
  const receipts = await InventoryStockTransactionLine.findAll({
    where: { transactionId: { [Op.in]: headers.map((h) => h.id) }, ...(itemId ? { itemId } : {}) },
    transaction: transaction ?? null,
  })
  const allocations = await InventoryIssueAllocation.findAll({
    where: { receiptLineId: { [Op.in]: receipts.map((r) => r.id) } },
    transaction: transaction ?? null,
  })
  const used = new Map<string, number>()
  for (const a of allocations) used.set(a.receiptLineId, (used.get(a.receiptLineId) ?? 0) + a.quantity)
  return receipts.map((r) => ({
    ...r.toJSON(),
    createdAt: r.createdAt!,
    remainingQuantity: r.quantity - (used.get(r.id) ?? 0),
  }))
}
async function eligibleRecipients(
  locationId: string,
  type: 'resident' | 'staff',
  recipientId?: string,
  transaction?: Transaction,
) {
  const options = { transaction: transaction ?? null }
  if (type === 'resident') {
    const residents = await Resident.findAll({
      where: {
        locId: locationId,
        isActive: true,
        isDeleted: false,
        ...(recipientId ? { id: recipientId } : {}),
      },
      ...options,
    })
    return residents.map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(' '), type }))
  }
  const property = await Property.findByPk(locationId, options)
  if (!property) return fail('Property not found', 404)
  const roles = await Role.findAll({ where: { code: { [Op.notIn]: ['RESIDENT', 'FAMILY_MEMBER'] } }, ...options })
  const links = await UserLocation.findAll({
    where: {
      isActive: true,
      isDeleted: false,
      roleId: { [Op.in]: roles.map((r) => r.id) },
      [Op.or]: [
        { locId: locationId },
        { [Op.and]: [where(col('locId'), Op.is, null), { companyId: property.companyId }] },
      ],
      ...(recipientId ? { userId: recipientId } : {}),
    },
    ...options,
  })
  const users = await User.findAll({
    where: {
      id: { [Op.in]: links.map((l) => l.userId) },
      isActive: true,
      isDeleted: false,
      status: 'ACTIVE',
    },
    ...options,
  })
  const details = await UserDetail.findAll({ where: { userId: { [Op.in]: users.map((u) => u.id) } }, ...options })
  return users.map((u) => {
    const detail = details.find((d) => d.userId === u.id)
    return {
      id: u.id,
      name: [detail?.firstName, detail?.lastName].filter(Boolean).join(' ') || u.username || u.email || u.id,
      type,
    }
  })
}
export async function assignmentRecipients(
  locationId: string,
  query: { type: 'resident' | 'staff'; search: string; page: number; limit: number },
) {
  const records = (await eligibleRecipients(locationId, query.type))
    .filter((r) => matches(r.name, query.search))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return {
    records: records.slice((query.page - 1) * query.limit, query.page * query.limit),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems: records.length,
      totalPages: Math.ceil(records.length / query.limit),
    },
  }
}
async function prepareAssignment(locationId: string, input: AssignmentInput, transaction: Transaction) {
  const type = input.residentId ? 'resident' : 'staff'
  const recipient = (
    await eligibleRecipients(locationId, type, input.residentId ?? input.assignedUserId, transaction)
  )[0]
  if (!recipient) return fail('Select an active recipient at this property')
  const items = []
  for (const entry of [...input.items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
    const { item } = await requireItem(locationId, entry.itemId, transaction)
    assertQuantity(entry.quantity, item)
    const balance = await InventoryStock.findOne({ where: { locationId, itemId: item.id }, transaction })
    const receipts = await remainingReceipts(locationId, item.id, transaction)
    const availableQuantity = balance?.quantity ?? 0
    if (
      receipts.some((r) => r.remainingQuantity < 0) ||
      receipts.reduce((n, r) => n + r.remainingQuantity, 0) !== availableQuantity
    )
      return fail(
        `${item.name}: receipt history does not reconcile with stock. Review inventory before assigning.`,
        409,
      )
    if (entry.quantity > availableQuantity) return fail(`${item.name}: insufficient stock`, 409)
    const allocations = allocateFIFO(receipts, entry.quantity).map(({ receipt, quantity }) => ({
      receipt,
      quantity,
      mrpAmount: allocationAmount(quantity, receipt.packQuantity, receipt.mrpPrice),
    }))
    items.push({
      itemId: item.id,
      itemName: item.name,
      quantity: entry.quantity,
      availableQuantity,
      remainingQuantity: availableQuantity - entry.quantity,
      mrpAmount: sumAmounts(allocations.map((a) => a.mrpAmount)),
      allocations,
    })
  }
  return { recipient, items, mrpAmount: sumAmounts(items.map((i) => i.mrpAmount)) }
}
export async function previewAssignment(locationId: string, input: AssignmentInput) {
  // A transaction gives the preview a coherent inventory view, without writes.
  return write(locationId, (transaction) => prepareAssignment(locationId, input, transaction))
}
export async function assignItems(locationId: string, input: AssignmentInput, userId: string) {
  const id = await write(locationId, async (transaction) => {
    const requestHash = hash({ operation: 'assign-items', ...input })
    const previous = await InventoryStockTransaction.findOne({
      where: { locationId, requestId: input.requestId },
      transaction,
    })
    if (previous) {
      if (previous.transactionType !== 'issue' || previous.requestHash !== requestHash)
        return fail('Request ID was already used for a different transaction', 409)
      return previous.id
    }
    const prepared = await prepareAssignment(locationId, input, transaction)
    const record = await InventoryStockTransaction.create(
      {
        locationId,
        supplierId: null,
        purchaseOrderId: null,
        transactionType: 'issue',
        transactionNumber: `ST-${randomUUID().slice(0, 8).toUpperCase()}`,
        date: input.date,
        residentId: input.residentId ?? null,
        assignedUserId: input.assignedUserId ?? null,
        recipientName: prepared.recipient.name,
        notes: input.notes ?? null,
        requestId: input.requestId,
        requestHash,
        createdBy: userId,
        updatedBy: userId,
      },
      { transaction },
    )
    for (const item of prepared.items) {
      for (const allocation of item.allocations) {
        const { receipt, quantity, mrpAmount } = allocation
        const line = await InventoryStockTransactionLine.create(
          {
            itemId: receipt.itemId,
            packType: receipt.packType,
            packUnit: receipt.packUnit,
            packQuantity: receipt.packQuantity,
            transactionId: record.id,
            quantity,
            unitCost: receipt.unitCost,
            mrpPrice: receipt.mrpPrice,
            batchNumber: receipt.batchNumber,
            transitId: receipt.transitId,
            receivedDate: receipt.receivedDate,
            manufacturedDate: receipt.manufacturedDate,
            expiryDate: receipt.expiryDate,
            itemName: receipt.itemName,
            createdBy: userId,
            updatedBy: userId,
          },
          { transaction },
        )
        await InventoryIssueAllocation.create(
          {
            receiptLineId: receipt.id,
            issueLineId: line.id,
            quantity,
            mrpAmount,
            createdBy: userId,
            updatedBy: userId,
          },
          { transaction },
        )
      }
      await InventoryStock.update(
        { quantity: item.remainingQuantity, updatedBy: userId },
        {
          where: { locationId, itemId: item.itemId },
          transaction,
        },
      )
    }
    return record.id
  })
  return stockTransactionDetail(locationId, id)
}
