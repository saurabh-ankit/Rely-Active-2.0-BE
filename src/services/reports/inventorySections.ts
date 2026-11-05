import { userNameSql } from '../dashboardQuery.service.js'
import { activeFilter, inRange, localDateTime, options, type ReportSection } from './reportSql.js'

/** The Inventory report's tabs after Transactions: the property's items with stock, its suppliers and purchase orders. */

/** `Box (10 tablets)` from a pack type, quantity and unit. */
export const packSql = (alias: string) =>
  `NULLIF(TRIM(CONCAT_WS(' ', ${alias}.packType, IF(${alias}.packQuantity IS NULL, NULL,
    CONCAT('(', ${alias}.packQuantity, ' ', COALESCE(${alias}.packUnit, ''), ')')))), '')`

/** Quantity in units at a price per package of `packQuantity` units, as the Inventory module totals it. */
export const packAmountSql = (quantity: string, packQuantity: string, price: string) =>
  `ROUND(COALESCE(${quantity}, 0) / COALESCE(NULLIF(${packQuantity}, 0), 1) * COALESCE(${price}, 0), 2)`

const STOCK_LEVELS = ['Out of stock', 'Below minimum', 'Low stock', 'In stock']

export const INVENTORY_SECTIONS: ReportSection[] = [
  {
    key: 'items',
    title: 'Items',
    description: "The property's items with current stock, minimum, maximum and threshold levels and suppliers.",
    dateBasis: null,
    filter: {
      label: 'Stock Level',
      column: 'x.stockLevel',
      options: STOCK_LEVELS.map((s) => ({ value: s, label: s })),
    },
    columns: [
      { key: 'item', header: 'Item' },
      { key: 'category', header: 'Category' },
      { key: 'pack', header: 'Pack' },
      { key: 'stock', header: 'Current Stock', type: 'number', total: true },
      { key: 'minQuantity', header: 'Minimum', type: 'number' },
      { key: 'maxQuantity', header: 'Maximum', type: 'number' },
      { key: 'threshold', header: 'Threshold', type: 'number' },
      { key: 'stockLevel', header: 'Stock Level' },
      { key: 'suppliers', header: 'Suppliers' },
      { key: 'lastPurchased', header: 'Last Purchased', type: 'date' },
      { key: 'status', header: 'Status' },
    ],
    sql: (status) => `
      SELECT x.* FROM (
        SELECT it.name AS item, ic.name AS category, ${packSql('it')} AS pack, COALESCE(st.quantity, 0) AS stock,
          il.minQuantity, il.maxQuantity, il.threshold,
          CASE
            WHEN COALESCE(st.quantity, 0) = 0 THEN 'Out of stock'
            WHEN st.quantity < COALESCE(il.minQuantity, 0) THEN 'Below minimum'
            WHEN st.quantity < COALESCE(il.threshold, 0) THEN 'Low stock'
            ELSE 'In stock'
          END AS stockLevel,
          (SELECT GROUP_CONCAT(v.name ORDER BY v.name SEPARATOR ', ')
            FROM inventory_item_vendors iv JOIN inventory_vendors v ON v.id = iv.vendorId AND v.isDeleted = 0
            WHERE iv.itemId = it.id AND iv.locationId = :loc) AS suppliers,
          (SELECT DATE_FORMAT(MAX(tx.date), '%Y-%m-%d')
            FROM inventory_stock_transactions tx JOIN inventory_stock_transaction_lines l ON l.transactionId = tx.id
            WHERE tx.locationId = :loc AND tx.transactionType = 'purchase' AND l.itemId = it.id) AS lastPurchased,
          IF(it.isActive = 1, 'Active', 'Inactive') AS status
        FROM inventory_item_locations il
        JOIN inventory_items it ON it.id = il.itemId
        LEFT JOIN inventory_categories ic ON ic.id = it.categoryId
        LEFT JOIN inventory_stock st ON st.locationId = il.locationId AND st.itemId = it.id
        WHERE il.locationId = :loc
      ) x
      WHERE 1 = 1 ${status}
      ORDER BY x.category, x.item`,
  },
  {
    key: 'suppliers',
    title: 'Suppliers',
    description: "The property's suppliers with contact details, items supplied and purchase orders.",
    dateBasis: null,
    filter: activeFilter('v.isActive'),
    columns: [
      { key: 'supplier', header: 'Supplier' },
      { key: 'contactPerson', header: 'Contact Person' },
      { key: 'phone', header: 'Phone' },
      { key: 'email', header: 'Email' },
      { key: 'address', header: 'Address' },
      { key: 'items', header: 'Items Supplied' },
      { key: 'purchaseOrders', header: 'Purchase Orders', type: 'number', total: true },
      { key: 'status', header: 'Status' },
      { key: 'addedAt', header: 'Added On', type: 'datetime' },
    ],
    sql: (status) => `
      SELECT v.name AS supplier, v.contactPerson, v.phone, v.email, v.address,
        (SELECT GROUP_CONCAT(it.name ORDER BY it.name SEPARATOR ', ')
          FROM inventory_item_vendors iv JOIN inventory_items it ON it.id = iv.itemId
          WHERE iv.vendorId = v.id AND iv.locationId = :loc) AS items,
        (SELECT COUNT(*) FROM inventory_purchase_orders po WHERE po.supplierId = v.id AND po.locationId = :loc)
          AS purchaseOrders,
        IF(v.isActive = 1, 'Active', 'Inactive') AS status, ${localDateTime('vl.createdAt')} AS addedAt
      FROM inventory_vendor_locations vl
      JOIN inventory_vendors v ON v.id = vl.vendorId AND v.isDeleted = 0
      WHERE vl.locationId = :loc ${status}
      ORDER BY v.name`,
  },
  {
    key: 'purchase-orders',
    title: 'Purchase Orders',
    description: 'Purchase orders line by line, with supplier, quantities ordered and received, and price.',
    dateBasis: 'Order date',
    filter: {
      label: 'Status',
      column: 'po.status',
      options: options(
        'draft',
        'approval_pending',
        'approved',
        'rejected',
        'pending',
        'partially_received',
        'received',
        'cancelled',
      ),
    },
    columns: [
      { key: 'orderedAt', header: 'Order Date', type: 'datetime' },
      { key: 'poNumber', header: 'PO No.' },
      { key: 'supplier', header: 'Supplier' },
      { key: 'status', header: 'Status', humanize: true },
      { key: 'item', header: 'Item' },
      { key: 'pack', header: 'Pack' },
      { key: 'ordered', header: 'Ordered', type: 'number', total: true },
      { key: 'received', header: 'Received', type: 'number', total: true },
      { key: 'pending', header: 'Pending', type: 'number', total: true },
      { key: 'agreedPrice', header: 'Price per Package (₹)', type: 'money' },
      { key: 'amount', header: 'Amount (₹)', type: 'money', total: true },
      { key: 'notes', header: 'Notes' },
      { key: 'createdBy', header: 'Created By' },
    ],
    sql: (status) => `
      SELECT ${localDateTime('po.createdAt')} AS orderedAt, po.poNumber, v.name AS supplier, po.status,
        COALESCE(it.name, pl.itemName) AS item, ${packSql('pl')} AS pack, pl.orderedQuantity AS ordered,
        COALESCE(pl.receivedQuantity, 0) AS received,
        GREATEST(COALESCE(pl.orderedQuantity, 0) - COALESCE(pl.receivedQuantity, 0), 0) AS pending, pl.agreedPrice,
        ${packAmountSql('pl.orderedQuantity', 'pl.packQuantity', 'pl.agreedPrice')} AS amount, po.notes,
        ${userNameSql('po.createdBy')} AS createdBy
      FROM inventory_purchase_orders po
      LEFT JOIN inventory_purchase_order_lines pl ON pl.purchaseOrderId = po.id
      LEFT JOIN inventory_items it ON it.id = pl.itemId
      LEFT JOIN inventory_vendors v ON v.id = po.supplierId
      WHERE po.locationId = :loc AND ${inRange('po.createdAt')} ${status}
      ORDER BY po.createdAt, po.poNumber, item`,
  },
]
