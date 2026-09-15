import { DataTypes, type QueryInterface } from 'sequelize'
const common = {
  id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
  createdBy: { type: DataTypes.CHAR(36), allowNull: true },
  updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false },
}
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.createTable('inventory_categories', {
    ...common,
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    image: { type: DataTypes.STRING(500), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  })
  await qi.createTable('inventory_vendors', {
    ...common,
    name: { type: DataTypes.STRING(255), allowNull: false },
    contactPerson: { type: DataTypes.STRING(255), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  })
  await qi.createTable('inventory_items', {
    ...common,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_categories', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    name: { type: DataTypes.STRING(255), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    packType: { type: DataTypes.STRING(30), allowNull: false },
    packQuantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    packUnit: { type: DataTypes.STRING(30), allowNull: false },
  })
  await qi.createTable('inventory_category_locations', {
    ...common,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_categories', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
  })
  await qi.addIndex('inventory_category_locations', ['categoryId', 'locationId'], {
    unique: true,
    name: 'inv_category_locations_unique',
  })
  await qi.createTable('inventory_vendor_locations', {
    ...common,
    vendorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_vendors', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
  })
  await qi.addIndex('inventory_vendor_locations', ['vendorId', 'locationId'], {
    unique: true,
    name: 'inv_vendor_locations_unique',
  })
  await qi.createTable('inventory_item_locations', {
    ...common,
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_items', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
  })
  await qi.addIndex('inventory_item_locations', ['itemId', 'locationId'], {
    unique: true,
    name: 'inv_item_locations_unique',
  })
  await qi.createTable('inventory_item_vendors', {
    ...common,
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_items', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_vendors', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
  })
  await qi.addIndex('inventory_item_vendors', ['itemId', 'vendorId', 'locationId'], {
    unique: true,
    name: 'inv_item_vendors_unique',
  })
  await qi.createTable('inventory_field_definitions', {
    ...common,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_categories', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    fieldName: { type: DataTypes.STRING(255), allowNull: false },
    fieldLabel: { type: DataTypes.STRING(255), allowNull: false },
    fieldType: { type: DataTypes.ENUM('text', 'number', 'select', 'date', 'boolean'), allowNull: false },
    isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    defaultValue: { type: DataTypes.JSON, allowNull: true },
    enumValues: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    displayOrder: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  })
  await qi.addIndex('inventory_field_definitions', ['categoryId', 'fieldName'], {
    unique: true,
    name: 'inv_field_definitions_unique',
  })
  await qi.createTable('inventory_field_values', {
    ...common,
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_items', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    fieldDefinitionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_field_definitions', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    value: { type: DataTypes.JSON, allowNull: true },
  })
  await qi.addIndex('inventory_field_values', ['itemId', 'fieldDefinitionId'], {
    unique: true,
    name: 'inv_field_values_unique',
  })
}
export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.dropTable('inventory_field_values')
  await qi.dropTable('inventory_field_definitions')
  await qi.dropTable('inventory_item_vendors')
  await qi.dropTable('inventory_item_locations')
  await qi.dropTable('inventory_vendor_locations')
  await qi.dropTable('inventory_category_locations')
  await qi.dropTable('inventory_items')
  await qi.dropTable('inventory_vendors')
  await qi.dropTable('inventory_categories')
}
