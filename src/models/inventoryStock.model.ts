import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
const fk = (model: string) => ({
  type: DataTypes.UUID,
  allowNull: false,
  references: { model, key: 'id' },
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
})
const text = (length: number) => ({ type: DataTypes.STRING(length), allowNull: false })
const quantity = { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
const money = { type: DataTypes.DECIMAL(12, 2), allowNull: false }
const date = { type: DataTypes.DATEONLY, allowNull: false }

interface InventoryStockAttributes extends BaseAttributes {
  locationId: string
  itemId: string
  quantity: number
}
export class InventoryStock extends BaseModel<
  InventoryStockAttributes,
  Optional<InventoryStockAttributes, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
> {
  declare locationId: string
  declare itemId: string
  declare quantity: number
}
InventoryStock.init(
  { ...baseModelColumns, locationId: fk('properties'), itemId: fk('inventory_items'), quantity: { ...quantity } },
  {
    sequelize,
    tableName: 'inventory_stock',
    timestamps: true,
    indexes: [{ unique: true, fields: ['locationId', 'itemId'] }],
  },
)

interface InventoryPurchaseOrderAttributes extends BaseAttributes {
  locationId: string
  supplierId: string
  poNumber: string
  status: string
  requestId: string
  requestHash: string
  notes: string | null
}
export class InventoryPurchaseOrder extends BaseModel<
  InventoryPurchaseOrderAttributes,
  Optional<InventoryPurchaseOrderAttributes, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
> {
  declare locationId: string
  declare supplierId: string
  declare poNumber: string
  declare status: string
  declare requestId: string
  declare requestHash: string
  declare notes: string | null
}
InventoryPurchaseOrder.init(
  {
    ...baseModelColumns,
    locationId: fk('properties'),
    supplierId: fk('inventory_vendors'),
    poNumber: text(60),
    status: text(30),
    requestId: text(36),
    requestHash: text(64),
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'inventory_purchase_orders',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['locationId', 'poNumber'] },
      { unique: true, fields: ['locationId', 'requestId'] },
    ],
  },
)

interface InventoryPurchaseOrderLineAttributes extends BaseAttributes {
  purchaseOrderId: string
  itemId: string
  itemName: string
  packType: string
  packUnit: string
  packQuantity: number
  orderedQuantity: number
  receivedQuantity: number
  agreedPrice: number
}
export class InventoryPurchaseOrderLine extends BaseModel<
  InventoryPurchaseOrderLineAttributes,
  Optional<InventoryPurchaseOrderLineAttributes, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
> {
  declare purchaseOrderId: string
  declare itemId: string
  declare itemName: string
  declare packType: string
  declare packUnit: string
  declare packQuantity: number
  declare orderedQuantity: number
  declare receivedQuantity: number
  declare agreedPrice: number
}
InventoryPurchaseOrderLine.init(
  {
    ...baseModelColumns,
    purchaseOrderId: fk('inventory_purchase_orders'),
    itemId: fk('inventory_items'),
    itemName: text(255),
    packType: text(30),
    packUnit: text(30),
    packQuantity: { ...quantity },
    orderedQuantity: { ...quantity },
    receivedQuantity: { ...quantity },
    agreedPrice: { ...money },
  },
  {
    sequelize,
    tableName: 'inventory_purchase_order_lines',
    timestamps: true,
    indexes: [{ unique: true, fields: ['purchaseOrderId', 'itemId'] }],
  },
)

interface InventoryStockTransactionAttributes extends BaseAttributes {
  locationId: string
  supplierId: string | null
  purchaseOrderId: string | null
  transactionNumber: string
  transactionType: string
  date: string
  notes: string | null
  requestId: string
  requestHash: string
  residentId?: string | null
  assignedUserId?: string | null
  recipientName?: string | null
}
export class InventoryStockTransaction extends BaseModel<
  InventoryStockTransactionAttributes,
  Optional<InventoryStockTransactionAttributes, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
> {
  declare locationId: string
  declare supplierId: string | null
  declare purchaseOrderId: string | null
  declare transactionNumber: string
  declare residentId: string | null
  declare assignedUserId: string | null
  declare recipientName: string | null
  declare transactionType: string
  declare date: string
  declare notes: string | null
  declare requestId: string
  declare requestHash: string
}
InventoryStockTransaction.init(
  {
    ...baseModelColumns,
    locationId: fk('properties'),
    supplierId: { ...fk('inventory_vendors'), allowNull: true },
    purchaseOrderId: { ...fk('inventory_purchase_orders'), allowNull: true },
    transactionNumber: text(60),
    transactionType: text(30),
    residentId: { ...fk('residents'), allowNull: true },
    assignedUserId: { ...fk('users'), allowNull: true },
    recipientName: { type: DataTypes.STRING(255), allowNull: true },
    date: { ...date },
    notes: { type: DataTypes.TEXT, allowNull: true },
    requestId: text(36),
    requestHash: text(64),
  },
  {
    sequelize,
    tableName: 'inventory_stock_transactions',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['locationId', 'requestId'] },
      { unique: true, fields: ['locationId', 'transactionNumber'] },
    ],
  },
)

interface InventoryStockTransactionLineAttributes extends BaseAttributes {
  transactionId: string
  itemId: string
  itemName: string
  packType: string
  packUnit: string
  packQuantity: number
  quantity: number
  unitCost: number
  mrpPrice: number
  batchNumber: string | null
  transitId: string | null
  receivedDate: string
  manufacturedDate: string | null
  expiryDate: string | null
}
export class InventoryStockTransactionLine extends BaseModel<
  InventoryStockTransactionLineAttributes,
  Optional<InventoryStockTransactionLineAttributes, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
> {
  declare transactionId: string
  declare itemId: string
  declare itemName: string
  declare packType: string
  declare packUnit: string
  declare packQuantity: number
  declare quantity: number
  declare unitCost: number
  declare mrpPrice: number
  declare batchNumber: string | null
  declare transitId: string | null
  declare receivedDate: string
  declare manufacturedDate: string | null
  declare expiryDate: string | null
}
InventoryStockTransactionLine.init(
  {
    ...baseModelColumns,
    transactionId: fk('inventory_stock_transactions'),
    itemId: fk('inventory_items'),
    itemName: text(255),
    packType: text(30),
    packUnit: text(30),
    packQuantity: { ...quantity },
    quantity: { ...quantity },
    unitCost: { ...money },
    mrpPrice: { ...money },
    batchNumber: { ...text(100), allowNull: true },
    transitId: { ...text(100), allowNull: true },
    receivedDate: { ...date },
    manufacturedDate: { ...date, allowNull: true },
    expiryDate: { ...date, allowNull: true },
  },
  { sequelize, tableName: 'inventory_stock_transaction_lines', timestamps: true, indexes: [] },
)

interface InventoryIssueAllocationAttributes extends BaseAttributes {
  receiptLineId: string
  issueLineId: string
  quantity: number
  mrpAmount: number
}
export class InventoryIssueAllocation extends BaseModel<
  InventoryIssueAllocationAttributes,
  Optional<InventoryIssueAllocationAttributes, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
> {
  declare receiptLineId: string
  declare issueLineId: string
  declare quantity: number
  declare mrpAmount: number
}
InventoryIssueAllocation.init(
  {
    ...baseModelColumns,
    receiptLineId: fk('inventory_stock_transaction_lines'),
    issueLineId: fk('inventory_stock_transaction_lines'),
    quantity: { ...quantity },
    mrpAmount: { type: DataTypes.DECIMAL(24, 2), allowNull: false },
  },
  {
    sequelize,
    tableName: 'inventory_issue_allocations',
    timestamps: true,
    indexes: [{ fields: ['receiptLineId'] }, { unique: true, fields: ['issueLineId'] }],
  },
)
