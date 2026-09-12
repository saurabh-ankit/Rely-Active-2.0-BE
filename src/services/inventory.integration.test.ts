import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import express from 'express'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { Sequelize, DataTypes, type QueryInterface } from 'sequelize'

// Opt-in only. Never runs migrations against the configured application database.
const database = process.env.INVENTORY_TEST_DATABASE
const access = vi.hoisted(() => ({ superAdmin: true, authenticated: true }))
vi.mock('../middlewares/authenticate.js', () => ({
  authenticate: (req: express.Request & { user?: unknown }, res: express.Response, next: express.NextFunction) => {
    if (!access.authenticated) {
      res.status(401).json({ success: false })
      return
    }
    req.user = { id: '00000000-0000-4000-8000-000000000001', roles: ['SUPER_ADMIN'] }
    next()
  },
}))
vi.mock('../middlewares/s3/index.js', () => ({
  uploadFileToS3: vi.fn(async () => ({ location: 'https://example.com/inventory/category.png' })),
}))
vi.mock('./authorization.service.js', () => ({
  AuthorizationService: { getUserAuthorizationContext: async () => ({ isSuperAdmin: access.superAdmin }) },
}))

describe.skipIf(!database)('inventory isolated MySQL integration', () => {
  let admin: Sequelize
  let db: Sequelize
  let qi: QueryInterface
  let app: express.Express
  let migration: typeof import('../migrations/20260911120000-create-inventory-master-tables.js')
  let models: typeof import('../models/index.js')
  const locationId = randomUUID()
  const otherLocationId = randomUUID()
  let categoryId: string
  let vendorId: string
  let itemId: string
  let fieldId: string
  beforeAll(async () => {
    if (!database || !/^rely_inventory_test_[a-z0-9_]+$/.test(database))
      throw new Error('Use a dedicated rely_inventory_test_* database')
    admin = process.env.DATABASE_URL
      ? new Sequelize(process.env.DATABASE_URL, { logging: false })
      : new Sequelize(
          process.env.DB_NAME || 'rely_active_new',
          process.env.DB_USER || 'root',
          process.env.DB_PASS || 'xelpmoc',
          {
            dialect: 'mysql',
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 3306,
            logging: false,
          },
        )
    const [existing] = await admin.query('SHOW DATABASES LIKE :name', { replacements: { name: database } })
    if (existing.length) throw new Error('Test database must not already exist')
    await admin.query(`CREATE DATABASE \`${database}\``)
    process.env.DB_NAME = database
    if (process.env.DATABASE_URL) {
      const url = new URL(process.env.DATABASE_URL)
      url.pathname = `/${database}`
      process.env.DATABASE_URL = url.toString()
    }
    db = (await import('../config/db/index.js')).default
    qi = db.getQueryInterface()
    await qi.createTable('properties', {
      id: { type: DataTypes.UUID, primaryKey: true },
      property_name: { type: DataTypes.STRING(255) },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    })
    await qi.bulkInsert('properties', [
      { id: locationId, property_name: 'Alpha', isActive: true, isDeleted: false },
      { id: otherLocationId, property_name: 'Beta', isActive: true, isDeleted: false },
    ])
    migration = await import('../migrations/20260911120000-create-inventory-master-tables.js')
    await migration.up({ context: qi })
    await (await import('../migrations/20260912150000-add-inventory-item-thresholds.js')).up({ context: qi })
    await (await import('../migrations/20260912170000-add-inventory-location-thresholds.js')).up({ context: qi })
    models = await import('../models/index.js')
    app = express()
    app.use(express.json())
    app.use('/inventory', (await import('../web-app/routes/inventory.routes.js')).default)
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(500).json({ message: error.message }),
    )
  }, 30000)
  afterAll(async () => {
    if (db) {
      await db.close()
      await admin.query(`DROP DATABASE \`${database}\``)
    }
    if (admin) await admin.close()
  }, 30000)
  it('enforces authentication and super-admin authorization', async () => {
    access.authenticated = false
    expect((await request(app).get('/inventory/categories')).status).toBe(401)
    access.authenticated = true
    access.superAdmin = false
    expect((await request(app).get('/inventory/categories')).status).toBe(403)
    access.superAdmin = true
  })
  it('creates masters, locations, required fields and an item without stock tables', async () => {
    let response = await request(app).post('/inventory/categories').send({ name: 'Housekeeping' })
    expect(response.status, response.text).toBe(201)
    categoryId = response.body.data.id
    response = await request(app)
      .put(`/inventory/categories/${categoryId}/locations`)
      .send({ locationIds: [locationId] })
    expect(response.status, response.text).toBe(200)
    response = await request(app)
      .post('/inventory/vendors')
      .send({
        name: 'Supplies Ltd',
        phone: '9876543210',
        contactPerson: 'Supply Contact',
        address: 'Supply Street',
        locationIds: [locationId],
      })
    expect(response.status, response.text).toBe(201)
    vendorId = response.body.data.id
    expect(
      (
        await request(app)
          .put(`/inventory/vendors/${vendorId}/locations`)
          .send({ locationIds: [locationId] })
      ).status,
    ).toBe(200)
    response = await request(app)
      .post(`/inventory/categories/${categoryId}/fields`)
      .send({
        fieldName: 'size',
        fieldLabel: 'Size',
        fieldType: 'select',
        enumValues: ['S', 'L'],
        isRequired: true,
        defaultValue: 'S',
      })
    expect(response.status, response.text).toBe(201)
    fieldId = response.body.data.id
    response = await request(app)
      .post('/inventory/items')
      .send({
        name: 'Cleaner',
        categoryId,
        packType: 'bottle',
        packUnit: 'ml',
        packQuantity: 500,
        locationIds: [locationId],
        customFields: [],
      })
    expect(response.status, response.text).toBe(201)
    itemId = response.body.data.id
    expect(response.body.data.customFields[0].value).toBe('S')
    expect((await qi.showAllTables()).some((t) => String(t).includes('stock'))).toBe(false)
    response = await request(app)
      .put(`/inventory/items/${itemId}/vendors`)
      .send({ assignments: [{ vendorId, locationId }] })
    expect(response.status, response.text).toBe(200)
  })
  it('creates a category with custom field definitions in one call', async () => {
    const response = await request(app)
      .post('/inventory/categories')
      .send({
        name: 'Pharmacy',
        fieldDefinitions: [
          { fieldName: 'batchNumber', fieldLabel: 'Batch Number', fieldType: 'text', isRequired: false },
          {
            fieldName: 'expiry',
            fieldLabel: 'Expiry',
            fieldType: 'select',
            isRequired: true,
            enumValues: ['short', 'long'],
            defaultValue: 'short',
          },
        ],
      })
    expect(response.status).toBe(201)
    expect(response.body.data.fieldDefinitions).toHaveLength(2)
    expect(response.body.data.fieldDefinitions.map((f: { fieldName: string }) => f.fieldName).sort()).toEqual([
      'batchNumber',
      'expiry',
    ])
  })
  it('parses query parameters under Express 5 and ignores selected-property headers', async () => {
    const response = await request(app).get('/inventory/items?page=1&limit=1').set('x-location-id', otherLocationId)
    expect(response.status, response.text).toBe(200)
    expect(response.body.data.pagination.totalItems).toBe(1)
    expect((await request(app).get('/inventory/items?page=no')).status).toBe(400)
  })
  it('rejects orphan assignments and preserves previous data on rollback', async () => {
    expect(
      (await request(app).put(`/inventory/categories/${categoryId}/locations`).send({ locationIds: [] })).status,
    ).toBe(409)
    expect((await request(app).put(`/inventory/vendors/${vendorId}/locations`).send({ locationIds: [] })).status).toBe(
      409,
    )
    let response = await request(app)
      .put(`/inventory/items/${itemId}`)
      .send({
        name: 'Changed',
        categoryId,
        packType: 'bottle',
        packUnit: 'ml',
        packQuantity: 500,
        locationIds: [otherLocationId],
        customFields: [{ fieldDefinitionId: fieldId, value: 'S' }],
      })
    expect(response.status).toBe(409)
    response = await request(app).get(`/inventory/items/${itemId}`)
    expect(response.body.data.name).toBe('Cleaner')
    expect(response.body.data.locationIds).toEqual([locationId])
    response = await request(app)
      .put(`/inventory/items/${itemId}/vendors`)
      .send({ assignments: [{ vendorId, locationId: otherLocationId }] })
    expect(response.status).toBe(400)
    expect(await models.InventoryItemVendor.count()).toBe(1)
  })
  it('protects populated fields, required values and category ownership', async () => {
    expect((await request(app).delete(`/inventory/categories/${categoryId}/fields/${fieldId}`)).status).toBe(409)
    expect(
      (
        await request(app)
          .put(`/inventory/categories/${categoryId}/fields/${fieldId}`)
          .send({
            fieldName: 'size',
            fieldLabel: 'Size',
            fieldType: 'select',
            enumValues: ['L'],
            isRequired: true,
            defaultValue: 'L',
          })
      ).status,
    ).toBe(409)
    const response = await request(app)
      .put(`/inventory/items/${itemId}`)
      .send({
        name: 'Cleaner',
        categoryId,
        packType: 'bottle',
        packUnit: 'ml',
        packQuantity: 500,
        locationIds: [locationId],
        customFields: [{ fieldDefinitionId: fieldId, value: null }],
      })
    expect(response.status).toBe(400)
    expect(
      (
        await request(app)
          .post(`/inventory/categories/${categoryId}/fields`)
          .send({ fieldName: 'newRequired', fieldLabel: 'Required', fieldType: 'text', isRequired: true })
      ).status,
    ).toBe(409)
  })
  it('enforces database foreign keys and unique assignment keys', async () => {
    await expect(models.InventoryCategoryLocation.create({ categoryId, locationId })).rejects.toThrow()
    await expect(models.InventoryCategoryLocation.create({ categoryId, locationId: randomUUID() })).rejects.toThrow()
    for (const model of [
      models.InventoryCategory,
      models.InventoryVendor,
      models.InventoryItem,
      models.InventoryCategoryLocation,
      models.InventoryVendorLocation,
      models.InventoryItemLocation,
      models.InventoryItemVendor,
      models.InventoryFieldDefinition,
      models.InventoryFieldValue,
    ]) {
      const columns = await qi.describeTable(model.getTableName() as string)
      expect(Object.keys(columns).sort()).toEqual(Object.keys(model.getAttributes()).sort())
    }
  })
  it('supports deactivation and safely removing unused definitions and assignments', async () => {
    let response = await request(app).put(`/inventory/vendors/${vendorId}/status`).send({ isActive: false })
    expect(response.status, response.text).toBe(200)
    expect(
      (
        await request(app)
          .put(`/inventory/items/${itemId}/vendors`)
          .send({ assignments: [{ vendorId, locationId }] })
      ).status,
    ).toBe(400)
    expect((await request(app).put(`/inventory/items/${itemId}/vendors`).send({ assignments: [] })).status).toBe(200)
    expect((await request(app).put(`/inventory/items/${itemId}/locations`).send({ locationIds: [] })).status).toBe(400)
    expect(
      (await request(app).put(`/inventory/categories/${categoryId}/locations`).send({ locationIds: [] })).status,
    ).toBe(409)
    response = await request(app)
      .post(`/inventory/categories/${categoryId}/fields`)
      .send({ fieldName: 'notes', fieldLabel: 'Notes', fieldType: 'text', isRequired: false })
    expect(response.status).toBe(201)
    expect(
      (await request(app).delete(`/inventory/categories/${categoryId}/fields/${response.body.data.id}`)).status,
    ).toBe(200)
  })
  it('saves category fields atomically while preserving IDs and item values', async () => {
    const field = {
      fieldName: 'size',
      fieldLabel: 'Size',
      fieldType: 'select',
      enumValues: ['S', 'L'],
      isRequired: true,
      defaultValue: 'S',
      displayOrder: 0,
    }
    const created = await request(app)
      .post('/inventory/categories')
      .send({
        name: 'Atomic category',
        fieldDefinitions: [field, { fieldName: 'notes', fieldLabel: 'Notes', fieldType: 'text', isRequired: false }],
      })
    expect(created.status, created.text).toBe(201)
    const id = created.body.data.id
    const savedFieldId = created.body.data.fieldDefinitions.find(
      (f: { fieldName: string }) => f.fieldName === 'size',
    ).id
    await request(app)
      .put(`/inventory/categories/${id}/locations`)
      .send({ locationIds: [locationId] })
    const item = await request(app)
      .post('/inventory/items')
      .send({
        name: 'Atomic item',
        categoryId: id,
        packType: 'piece',
        packUnit: 'piece',
        packQuantity: 1,
        locationIds: [locationId],
        customFields: [],
      })
    expect(item.status, item.text).toBe(201)
    const updatedField = { ...field, id: savedFieldId, fieldLabel: 'Size label' }
    const response = await request(app)
      .put(`/inventory/categories/${id}`)
      .send({
        name: 'Updated category',
        fieldDefinitions: [
          updatedField,
          { fieldName: 'brand', fieldLabel: 'Brand', fieldType: 'text', isRequired: true, defaultValue: 'Rely' },
        ],
      })
    expect(response.status, response.text).toBe(200)
    expect(response.body.data.fieldDefinitions.find((f: { fieldName: string }) => f.fieldName === 'size').id).toBe(
      savedFieldId,
    )
    const values = await models.InventoryFieldValue.findAll({ where: { itemId: item.body.data.id } })
    expect(values.find((v) => v.fieldDefinitionId === savedFieldId)?.value).toBe('S')
    expect(values.map((v) => v.value)).toContain('Rely')
    const rejected = await request(app)
      .put(`/inventory/categories/${id}`)
      .send({ name: 'Should roll back', fieldDefinitions: [] })
    expect(rejected.status).toBe(409)
    expect((await models.InventoryCategory.findByPk(id))?.name).toBe('Updated category')
    expect(await models.InventoryFieldDefinition.count({ where: { categoryId: id } })).toBe(2)
    const foreign = await request(app)
      .put(`/inventory/categories/${id}`)
      .send({ name: 'Wrong owner', fieldDefinitions: [{ ...field, id: fieldId }] })
    expect(foreign.status).toBe(400)
    const before = await models.InventoryCategory.count()
    expect(
      (
        await request(app)
          .post('/inventory/categories')
          .send({ name: 'Duplicate fields', fieldDefinitions: [field, field] })
      ).status,
    ).toBe(400)
    expect(await models.InventoryCategory.count()).toBe(before)
  })
  it('saves vendor locations with contact details in one transaction', async () => {
    const response = await request(app)
      .post('/inventory/vendors')
      .send({
        name: 'Atomic vendor',
        contactPerson: 'Atomic Contact',
        phone: '9876543210',
        address: 'Atomic Street',
        locationIds: [locationId],
      })
    expect(response.status, response.text).toBe(201)
    expect(response.body.data.locationIds).toEqual([locationId])
    expect(
      (
        await request(app)
          .put(`/inventory/vendors/${response.body.data.id}`)
          .send({ name: 'Rejected rename', locationIds: [randomUUID()] })
      ).status,
    ).toBe(400)
    expect((await models.InventoryVendor.findByPk(response.body.data.id))?.name).toBe('Atomic vendor')
  })
  it('validates image uploads before using the shared upload service', async () => {
    expect((await request(app).post('/inventory/category-image')).status).toBe(400)
    expect(
      (
        await request(app)
          .post('/inventory/category-image')
          .attach('image', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' })
      ).status,
    ).toBe(400)
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    const response = await request(app)
      .post('/inventory/category-image')
      .attach('image', image, { filename: 'category.png', contentType: 'image/png' })
    expect(response.status, response.text).toBe(201)
    expect(response.body.data.image).toBe('https://example.com/inventory/category.png')
    expect(
      (
        await request(app)
          .post('/inventory/category-image')
          .attach('image', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' })
      ).status,
    ).toBe(400)
    access.superAdmin = false
    expect(
      (
        await request(app)
          .post('/inventory/category-image')
          .attach('image', image, { filename: 'category.png', contentType: 'image/png' })
      ).status,
    ).toBe(403)
    access.superAdmin = true
  })
  it('limits definitions to the item payload capacity', async () => {
    const count = await models.InventoryFieldDefinition.count({ where: { categoryId } })
    await models.InventoryFieldDefinition.bulkCreate(
      Array.from({ length: 100 - count }, (_, i) => ({
        categoryId,
        fieldName: `extra_${i}`,
        fieldLabel: `Extra ${i}`,
        fieldType: 'text' as const,
        isRequired: false,
        defaultValue: null,
        enumValues: [],
        displayOrder: i,
      })),
    )
    const response = await request(app)
      .post(`/inventory/categories/${categoryId}/fields`)
      .send({ fieldName: 'tooMany', fieldLabel: 'Too many', fieldType: 'text', isRequired: false })
    expect(response.status).toBe(409)
    expect(await models.InventoryFieldDefinition.count({ where: { categoryId } })).toBe(100)
  })
  it('persists shared thresholds, preserves omitted fields, and validates the merged range', async () => {
    const categoryResponse = await request(app).post('/inventory/categories').send({ name: 'Threshold category' })
    const thresholdCategoryId = categoryResponse.body.data.id
    await request(app)
      .put(`/inventory/categories/${thresholdCategoryId}/locations`)
      .send({ locationIds: [locationId, otherLocationId] })
    const payload = {
      name: 'Threshold item',
      categoryId: thresholdCategoryId,
      packType: 'strip',
      packUnit: 'tablet',
      packQuantity: 10,
      locationIds: [locationId],
      customFields: [],
    }
    let response = await request(app).post('/inventory/items').send(payload)
    expect(response.status, response.text).toBe(201)
    const id = response.body.data.id
    expect(response.body.data).toMatchObject({ minQuantity: 0, maxQuantity: 0, threshold: 0 })
    response = await request(app)
      .put(`/inventory/items/${id}`)
      .send({ ...payload, minQuantity: 30, maxQuantity: 100, threshold: 150 })
    expect(response.status, response.text).toBe(200)
    expect((await request(app).get(`/inventory/items/${id}`)).body.data).toMatchObject({
      minQuantity: 30,
      maxQuantity: 100,
      threshold: 150,
    })
    response = await request(app)
      .put(`/inventory/items/${id}`)
      .send({ ...payload, name: 'Renamed' })
    expect(response.body.data).toMatchObject({ minQuantity: 30, maxQuantity: 100, threshold: 150 })
    response = await request(app)
      .put(`/inventory/items/${id}`)
      .send({ ...payload, maxQuantity: 20 })
    expect(response.status).toBe(400)
    response = await request(app)
      .put(`/inventory/items/${id}/locations`)
      .send({ locationIds: [otherLocationId] })
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      locationIds: [otherLocationId],
      minQuantity: 30,
      maxQuantity: 100,
      threshold: 150,
    })
    response = await request(app).get(
      `/inventory/items?locationId=${otherLocationId}&categoryId=${thresholdCategoryId}`,
    )
    expect(response.body.data.records[0]).toMatchObject({ minQuantity: 30, maxQuantity: 100, threshold: 150 })
    response = await request(app)
      .put(`/inventory/items/${id}`)
      .send({ ...payload, minQuantity: 0, maxQuantity: 0, threshold: 0 })
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ minQuantity: 0, maxQuantity: 0, threshold: 0 })
    response = await request(app)
      .post('/inventory/items')
      .send({ ...payload, minQuantity: 1 })
    expect(response.status).toBe(400)
    response = await request(app)
      .post('/inventory/items')
      .send({ ...payload, minQuantity: 30, maxQuantity: 100, threshold: 50 })
    expect(response.status, response.text).toBe(201)
    expect(response.body.data).toMatchObject({ minQuantity: 30, maxQuantity: 100, threshold: 50 })
  })
  async function setupParity() {
    const category = await request(app)
      .post('/inventory/categories')
      .send({
        name: `Parity ${randomUUID()}`,
        fieldDefinitions: [
          {
            fieldName: 'type',
            fieldLabel: 'Type',
            fieldType: 'select',
            enumValues: ['Medical', 'Other'],
            isRequired: true,
            defaultValue: 'Medical',
          },
        ],
      })
    expect(category.status, category.text).toBe(201)
    const id = category.body.data.id as string
    expect(
      (
        await request(app)
          .put(`/inventory/categories/${id}/locations`)
          .send({ locationIds: [locationId, otherLocationId] })
      ).status,
    ).toBe(200)
    const vendor = await request(app)
      .post('/inventory/vendors')
      .send({
        name: `Vendor ${randomUUID()}`,
        contactPerson: 'Parity Contact',
        phone: '9876543210',
        address: 'Parity Street',
        email: 'parity@example.com',
        locationIds: [locationId, otherLocationId],
      })
    expect(vendor.status, vendor.text).toBe(201)
    return { category: category.body.data, vendor: vendor.body.data, id }
  }
  it('enforces category names, supplier fields and location requirements with searchable supplier contacts', async () => {
    expect((await request(app).post('/inventory/categories').send({ name: 'X' })).status).toBe(400)
    const { category, vendor } = await setupParity()
    expect(
      (
        await request(app)
          .post('/inventory/categories')
          .send({ name: `  ${category.name.toUpperCase()} ` })
      ).status,
    ).toBe(409)
    const availability = await request(app)
      .get('/inventory/categories/name-availability')
      .query({ name: category.name })
    expect(availability.body.data.available).toBe(false)
    expect(
      (
        await request(app)
          .get('/inventory/categories/name-availability')
          .query({ name: category.name, excludeCategoryId: category.id })
      ).body.data.available,
    ).toBe(true)
    expect(
      (await request(app).put(`/inventory/categories/${category.id}`).send({ name: category.name.toUpperCase() }))
        .status,
    ).toBe(200)
    const another = await request(app)
      .post('/inventory/categories')
      .send({ name: `Other ${randomUUID()}` })
    expect(
      (await request(app).put(`/inventory/categories/${another.body.data.id}`).send({ name: category.name })).status,
    ).toBe(409)
    expect((await request(app).post('/inventory/vendors').send({ name: 'Missing details' })).status).toBe(400)
    expect(
      (
        await request(app)
          .post('/inventory/vendors')
          .send({
            name: 'No location',
            phone: '9876543210',
            contactPerson: 'Contact',
            address: 'Address',
            locationIds: [],
          })
      ).status,
    ).toBe(400)
    for (const search of ['Parity Contact', 'parity@example.com']) {
      const response = await request(app).get('/inventory/vendors').query({ search })
      expect(response.body.data.records.some((v: { id: string }) => v.id === vendor.id)).toBe(true)
    }
    const assignments = await models.InventoryVendorLocation.count({ where: { vendorId: vendor.id } })
    for (const isActive of [false, true]) {
      expect(
        (await request(app).put(`/inventory/vendors/${vendor.id}/status`).send({ isActive })).body.data.isActive,
      ).toBe(isActive)
      expect(await models.InventoryVendorLocation.count({ where: { vendorId: vendor.id } })).toBe(assignments)
    }
  })
  it('preserves per-location overrides, applies global changes, and filters suppliers before pagination', async () => {
    const { id, vendor } = await setupParity()
    const payload = {
      name: 'Threshold medicine',
      categoryId: id,
      packType: 'strip',
      packQuantity: 10,
      packUnit: 'tablet',
      locationIds: [locationId, otherLocationId],
      customFields: [],
    }
    expect(
      (
        await request(app)
          .post('/inventory/items')
          .send({ ...payload, locationIds: [] })
      ).status,
    ).toBe(400)
    const created = await request(app)
      .post('/inventory/items')
      .send({ ...payload, minQuantity: 30, maxQuantity: 100, threshold: 50 })
    expect(created.status, created.text).toBe(201)
    const itemId = created.body.data.id as string
    const values = { minQuantity: 40, maxQuantity: 200, threshold: 70 }
    let response = await request(app)
      .put(`/inventory/items/${itemId}/thresholds`)
      .send({ locations: [{ locationId: otherLocationId, ...values }] })
    expect(response.status, response.text).toBe(200)
    expect(
      response.body.data.locationThresholds.find((x: { locationId: string }) => x.locationId === locationId),
    ).toMatchObject({ minQuantity: 30, maxQuantity: 100, threshold: 50 })
    response = await request(app).put(`/inventory/items/${itemId}`).send(payload)
    expect(
      response.body.data.locationThresholds.find((x: { locationId: string }) => x.locationId === otherLocationId),
    ).toMatchObject(values)
    response = await request(app)
      .put(`/inventory/items/${itemId}/thresholds`)
      .send({
        locations: [
          { locationId, minQuantity: 10, maxQuantity: 50, threshold: 20 },
          { locationId: randomUUID(), ...values },
        ],
      })
    expect(response.status).toBe(400)
    expect((await models.InventoryItemLocation.findOne({ where: { itemId, locationId } }))?.minQuantity).toBe(30)
    expect(
      (
        await request(app)
          .put(`/inventory/items/${itemId}/thresholds`)
          .send({ locations: [{ locationId, minQuantity: 2, maxQuantity: 1, threshold: 0 }] })
      ).status,
    ).toBe(400)
    response = await request(app)
      .put(`/inventory/items/${itemId}`)
      .send({ ...payload, minQuantity: 0, maxQuantity: 0, threshold: 0 })
    expect(
      response.body.data.locationThresholds.every(
        (x: { threshold: number; minQuantity: number; maxQuantity: number }) =>
          x.threshold === 0 && x.minQuantity === 0 && x.maxQuantity === 0,
      ),
    ).toBe(true)
    await request(app)
      .put(`/inventory/items/${itemId}/locations`)
      .send({ locationIds: [locationId] })
    await request(app)
      .put(`/inventory/items/${itemId}`)
      .send({ ...payload, locationIds: [locationId], minQuantity: 20, maxQuantity: 100, threshold: 30 })
    response = await request(app)
      .put(`/inventory/items/${itemId}/locations`)
      .send({ locationIds: [locationId, otherLocationId] })
    expect(
      response.body.data.locationThresholds.find((x: { locationId: string }) => x.locationId === otherLocationId),
    ).toMatchObject({ minQuantity: 20, maxQuantity: 100, threshold: 30 })
    await request(app)
      .put(`/inventory/items/${itemId}/vendors`)
      .send({ assignments: [{ vendorId: vendor.id, locationId }] })
    await request(app)
      .post('/inventory/items')
      .send({ ...payload, name: 'AAA unrelated' })
    response = await request(app)
      .get('/inventory/items')
      .query({ categoryId: id, vendorId: vendor.id, page: 1, limit: 1, search: 'medicine' })
    expect(response.body.data.pagination.totalItems).toBe(1)
    expect(response.body.data.records[0].id).toBe(itemId)
    response = await request(app)
      .get('/inventory/items')
      .query({ categoryId: id, vendorId: vendor.id, locationId: otherLocationId })
    expect(response.body.data.pagination.totalItems).toBe(0)
  })
  it('imports templates atomically, reuses items, and preserves unrelated assignments', async () => {
    const { id, category, vendor } = await setupParity()
    const { inventoryTemplate } = await import('./inventory-import.service.js')
    const template = await inventoryTemplate(id, 3)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(template)
    const sheet = workbook.getWorksheet('Items')!
    expect(sheet.getRow(1).values).toContain('Package Type*')
    expect(sheet.getRow(1).values).toContain(`Type* [${category.fieldDefinitions[0].id}]`)
    expect(sheet.getCell(2, 2).dataValidation.type).toBe('list')
    expect((await request(app).get(`/inventory/categories/${id}/template`).query({ rowCount: 501 })).status).toBe(400)
    const row = (location: string, locationName: string, minimum: number) => [
      `${category.name} [${id}]`,
      `${locationName} [${location}]`,
      `${vendor.name} [${vendor.id}]`,
      'Sample Medicine',
      'strip',
      10,
      'tablet',
      minimum,
      10,
      5,
      'Medical',
    ]
    sheet.getRow(2).values = row(locationId, 'Alpha', 3)
    sheet.getRow(3).values = row(otherLocationId, 'Beta', 4)
    const upload = async () =>
      request(app)
        .post(`/inventory/categories/${id}/import`)
        .attach('file', Buffer.from(await workbook.xlsx.writeBuffer()), 'items.xlsx')
    let response = await upload()
    expect(response.status, response.text).toBe(201)
    expect(response.body.data).toMatchObject({ importedCount: 2, createdCount: 1 })
    const items = await models.InventoryItem.findAll({ where: { categoryId: id } })
    expect(items).toHaveLength(1)
    const itemId = items[0]!.id
    expect((await models.InventoryItemLocation.findOne({ where: { itemId, locationId } }))?.minQuantity).toBe(30)
    expect(
      (await models.InventoryItemLocation.findOne({ where: { itemId, locationId: otherLocationId } }))?.minQuantity,
    ).toBe(40)
    expect(await models.InventoryItemVendor.count({ where: { itemId } })).toBe(2)
    sheet.getRow(3).values = []
    sheet.getCell(2, 8).value = 2
    response = await upload()
    expect(response.status, response.text).toBe(201)
    expect(response.body.data.createdCount).toBe(0)
    expect(await models.InventoryItem.count({ where: { categoryId: id } })).toBe(1)
    expect(
      (await models.InventoryItemLocation.findOne({ where: { itemId, locationId: otherLocationId } }))?.minQuantity,
    ).toBe(40)
    sheet.getRow(3).values = row(otherLocationId, 'Beta', 4)
    sheet.getCell(3, 4).value = 'New item'
    sheet.getCell(2, 3).value = 'Invalid supplier'
    response = await upload()
    expect(response.status).toBe(400)
    expect(response.body.errors[0]).toContain('Row 2:')
    expect(await models.InventoryItem.count({ where: { categoryId: id } })).toBe(1)
    sheet.getRow(2).values = row(locationId, 'Alpha', 3)
    sheet.getCell(2, 6).value = 20
    response = await upload()
    expect(response.status).toBe(400)
    expect(response.body.errors[0]).toContain('Shared details differ')
    sheet.getRow(2).values = row(locationId, 'Alpha', 3)
    sheet.getCell(2, 11).value = 'Invalid type'
    expect((await upload()).status).toBe(400)
    expect(
      (await request(app).post(`/inventory/categories/${id}/import`).attach('file', Buffer.from('bad'), 'bad.xlsx'))
        .status,
    ).toBe(400)
  })
  it('backfills location thresholds and does not overwrite overrides when rerun', async () => {
    const { id } = await setupParity()
    const item = await request(app)
      .post('/inventory/items')
      .send({
        name: 'Migration item',
        categoryId: id,
        packType: 'strip',
        packQuantity: 10,
        packUnit: 'tablet',
        minQuantity: 30,
        maxQuantity: 100,
        threshold: 50,
        locationIds: [locationId],
        customFields: [],
      })
    const migration = await import('../migrations/20260912170000-add-inventory-location-thresholds.js')
    await migration.down({ context: qi })
    const [before] = await db.query('SELECT id, itemId, locationId FROM inventory_item_locations ORDER BY id')
    await migration.up({ context: qi })
    const [after] = await db.query('SELECT id, itemId, locationId FROM inventory_item_locations ORDER BY id')
    expect(after).toEqual(before)
    const record = await models.InventoryItemLocation.findOne({ where: { itemId: item.body.data.id, locationId } })
    expect(record?.minQuantity).toBe(30)
    await record!.update({ minQuantity: 40 })
    await migration.up({ context: qi })
    expect((await record!.reload()).minQuantity).toBe(40)
  })
  it('adds zero thresholds to existing items without changing their other data', async () => {
    const thresholds = await import('../migrations/20260912150000-add-inventory-item-thresholds.js')
    await thresholds.down({ context: qi })
    const [before] = await db.query('SELECT * FROM inventory_items ORDER BY id')
    await thresholds.up({ context: qi })
    await thresholds.up({ context: qi })
    const [after] = await db.query('SELECT * FROM inventory_items ORDER BY id')
    expect(after).toEqual(before.map((row) => ({ ...row, minQuantity: 0, maxQuantity: 0, threshold: 0 })))
  })
  it('reverses and reapplies its isolated migration', async () => {
    await migration.down({ context: qi })
    expect(await qi.showAllTables()).toEqual(['properties'])
    await migration.up({ context: qi })
    expect((await qi.showAllTables()).length).toBe(10)
  })
})
