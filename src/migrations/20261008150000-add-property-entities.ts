import { randomUUID } from 'node:crypto'
import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize'

/**
 * Property structure: Property → Entity → (Block) → (Floor) → Unit.
 *
 * - property_entities: the kinds of homes in a property (Apartment, Villa, Duplex, Triplex), each
 *   with its own levels. Units keep hanging off floor → block so every existing unitId join keeps
 *   working; an entity that skips a level gets a hidden (is_virtual) block or floor instead.
 * - property_blocks: entityId, is_virtual, sort_order (stable tower order inside an entity).
 * - property_floors: is_virtual.
 * - property_units: attributes JSON (plot size, configuration…); unit_type gains villa/duplex/triplex/5BHK.
 * - properties: property_types (every kind it contains) replaces the single property_type.
 *
 * Every step checks first, so it is safe to run on a database that already has some of it.
 */

const PROPERTY_TYPES = ['apartment', 'villa', 'duplex', 'triplex']
const ENTITY_NAMES: Record<string, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  duplex: 'Duplex',
  triplex: 'Triplex',
}
const UNIT_TYPES_OLD = ['1BHK', '2BHK', '3BHK', '4BHK', 'studio', 'penthouse', 'shop', 'office']
const UNIT_TYPES_NEW = [...UNIT_TYPES_OLD, 'villa', 'duplex', 'triplex', '5BHK']

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // ── property_entities ──────────────────────────────────────────────────────
  const tables = (await queryInterface.showAllTables()).map((t) => String(t))
  if (!tables.includes('property_entities')) {
    await queryInterface.createTable('property_entities', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onDelete: 'CASCADE',
      },
      entity_type: { type: DataTypes.STRING(30), allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      levels: { type: DataTypes.JSON, allowNull: false },
      level_labels: { type: DataTypes.JSON, allowNull: true },
      settings: { type: DataTypes.JSON, allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('property_entities', ['propertyId'])
    console.log('✅ Created property_entities')
  }

  // ── property_blocks ────────────────────────────────────────────────────────
  const blockCols = await queryInterface.describeTable('property_blocks')
  if (!blockCols.entityId) {
    await queryInterface.addColumn('property_blocks', 'entityId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'property_entities', key: 'id' },
      onDelete: 'SET NULL',
    })
  }
  if (!blockCols.is_virtual) {
    await queryInterface.addColumn('property_blocks', 'is_virtual', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }

  // ── property_floors ────────────────────────────────────────────────────────
  const floorCols = await queryInterface.describeTable('property_floors')
  if (!floorCols.is_virtual) {
    await queryInterface.addColumn('property_floors', 'is_virtual', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }

  // ── property_units ─────────────────────────────────────────────────────────
  const unitCols = await queryInterface.describeTable('property_units')
  if (!unitCols.attributes) {
    await queryInterface.addColumn('property_units', 'attributes', { type: DataTypes.JSON, allowNull: true })
  }
  await queryInterface.changeColumn('property_units', 'unit_type', {
    type: DataTypes.ENUM(...UNIT_TYPES_NEW),
    allowNull: false,
    defaultValue: '2BHK',
  })

  // ── properties.property_types (filled from property_type while it still exists) ──
  let propCols = await queryInterface.describeTable('properties')
  if (!propCols.property_types) {
    await queryInterface.addColumn('properties', 'property_types', { type: DataTypes.JSON, allowNull: true })
  }
  if (propCols.property_type) {
    await queryInterface.sequelize.query(
      `UPDATE properties SET property_types = JSON_ARRAY(property_type)
        WHERE property_types IS NULL OR JSON_LENGTH(property_types) = 0`,
    )
  }

  // ── Backfill: each property's existing towers become one entity (levels block → floor → unit) ──
  const orphaned = await queryInterface.sequelize.query<{ propertyId: string; firstType: string | null }>(
    `SELECT DISTINCT b.propertyId, JSON_UNQUOTE(JSON_EXTRACT(p.property_types, '$[0]')) AS firstType
       FROM property_blocks b JOIN properties p ON p.id = b.propertyId
      WHERE b.entityId IS NULL`,
    { type: QueryTypes.SELECT },
  )
  for (const row of orphaned) {
    const entityId = randomUUID()
    const type = row.firstType && PROPERTY_TYPES.includes(row.firstType) ? row.firstType : 'apartment'
    await queryInterface.sequelize.query(
      `INSERT INTO property_entities
         (id, propertyId, entity_type, name, levels, level_labels, settings, sort_order, isActive, isDeleted, createdAt, updatedAt)
       VALUES (:id, :propertyId, :type, :name, :levels, :labels, NULL, 0, 1, 0, NOW(), NOW())`,
      {
        replacements: {
          id: entityId,
          propertyId: row.propertyId,
          type,
          name: ENTITY_NAMES[type] ?? 'Apartment',
          levels: JSON.stringify(['block', 'floor', 'unit']),
          labels: JSON.stringify({ block: 'Tower' }),
        },
      },
    )
    await queryInterface.sequelize.query(
      'UPDATE property_blocks SET entityId = :entityId WHERE propertyId = :propertyId AND entityId IS NULL',
      { replacements: { entityId, propertyId: row.propertyId } },
    )
  }
  if (orphaned.length) console.log(`✅ Backfilled ${orphaned.length} property entities`)

  // ── Block order (after entityId is set): existing blocks keep alphabetical order per entity ──
  if (!blockCols.sort_order) {
    await queryInterface.addColumn('property_blocks', 'sort_order', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    })
    await queryInterface.sequelize.query(
      `UPDATE property_blocks b
         JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY entityId ORDER BY block_name) - 1 AS rn FROM property_blocks) x
           ON x.id = b.id
        SET b.sort_order = x.rn`,
    )
  }

  // ── Drop the single property_type: property_types replaces it ─────────────
  propCols = await queryInterface.describeTable('properties')
  if (propCols.property_type) {
    await queryInterface.removeColumn('properties', 'property_type')
    console.log('✅ Dropped properties.property_type (property_types is used instead)')
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // Bring back property_type, filled from the first listed type.
  const propCols = await queryInterface.describeTable('properties')
  if (!propCols.property_type) {
    await queryInterface.addColumn('properties', 'property_type', {
      type: DataTypes.ENUM(...PROPERTY_TYPES),
      allowNull: false,
      defaultValue: 'apartment',
    })
    if (propCols.property_types) {
      await queryInterface.sequelize.query(
        `UPDATE properties
            SET property_type = JSON_UNQUOTE(JSON_EXTRACT(property_types, '$[0]'))
          WHERE JSON_UNQUOTE(JSON_EXTRACT(property_types, '$[0]')) IN ('apartment', 'villa', 'duplex', 'triplex')`,
      )
    }
  }
  if (propCols.property_types) await queryInterface.removeColumn('properties', 'property_types')

  const blockCols = await queryInterface.describeTable('property_blocks')
  if (blockCols.sort_order) await queryInterface.removeColumn('property_blocks', 'sort_order')
  if (blockCols.entityId) await queryInterface.removeColumn('property_blocks', 'entityId')
  if (blockCols.is_virtual) await queryInterface.removeColumn('property_blocks', 'is_virtual')

  const floorCols = await queryInterface.describeTable('property_floors')
  if (floorCols.is_virtual) await queryInterface.removeColumn('property_floors', 'is_virtual')

  const unitCols = await queryInterface.describeTable('property_units')
  if (unitCols.attributes) await queryInterface.removeColumn('property_units', 'attributes')

  const tables = (await queryInterface.showAllTables()).map((t) => String(t))
  if (tables.includes('property_entities')) await queryInterface.dropTable('property_entities')
  // unit_type stays widened: narrowing would fail on rows that use the new values.
}
