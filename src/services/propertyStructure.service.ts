import { Op, type Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import { PropertyEntityType, StructureLevel } from '../enums/propertyEntity.enum.js'
import type { UnitAreaUnit, UnitFacing, UnitStatus, UnitType } from '../enums/propertyUnit.enum.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { PropertyBlock, PropertyEntity, PropertyFloor, PropertyUnit, Resident } from '../models/index.js'
import type { StructureLevelLabels } from '../models/propertyEntity.model.js'
import type { EntityInput } from '../validations/property.validation.js'

/**
 * Property structure: Property → Entity → (Block) → (Floor) → Unit.
 *
 * Entities choose which levels they use. Units always hang off a floor and a block in the
 * database, so a skipped level is stored as a hidden (is_virtual) row. Callers only ever see
 * the nested `entities` JSON; the hidden rows are added on save and removed on read.
 */

// ─── Tower generator (block → floor → unit from counts + BHK templates) ──────

export interface FloorInputItem {
  id?: string
  floor_number: number
  floor_name?: string | null
  floor_type?: string
  is_sellable?: boolean
  description?: string | null
  units?: Array<{
    id?: string
    unit_number: string
    unit_type?: string
    position?: number | null
    direction?: string | null
    view_facing?: string | null
    is_sellable?: boolean
    carpet_area?: number | null
    built_up_area?: number | null
    super_built_up_area?: number | null
    area_unit?: string | null
    facing?: string | null
    price?: number | null
    price_per_sqft?: number | null
    status?: string
    attributes?: Record<string, unknown> | null
  }>
}

interface BHKPositionItem {
  position: number
  direction?: string | null
  view_facing?: string | null
}

interface BHKTemplateItem {
  type?: string
  carpet_area?: number | null
  super_built_up_area?: number | null
  built_up_area?: number | null
  positions?: BHKPositionItem[]
}

export interface BlockInputItem {
  total_floors?: number | string | null
  price_per_sqft?: number | string | null
  units_per_floor?: number | string | null
  prefix?: string | null
  nomenclature_template?: string | null
  bhk_templates?: BHKTemplateItem[]
  floors?: FloorInputItem[]
}

function generateUnitNumber(
  template: string | null | undefined,
  prefix: string,
  floorNumber: number,
  position: number,
): string {
  if (template) {
    return template
      .replace(/\{\{TowerPrefix\}\}/g, prefix)
      .replace(/\{\{FloorNumber\}\}/g, String(floorNumber))
      .replace(/\{\{Position\}\}/g, String(position))
  }
  return `${prefix}-${floorNumber}${position}`
}

export function resolveBlockFloorsAndUnits(blockInput: BlockInputItem): FloorInputItem[] {
  const customFloors = Array.isArray(blockInput.floors) ? blockInput.floors : []
  const maxCustomFloorNum = customFloors.reduce((max, fl) => Math.max(max, Number(fl.floor_number) || 0), 0)
  const totalF = blockInput.total_floors ? Number(blockInput.total_floors) : maxCustomFloorNum

  if (totalF <= 0 && customFloors.length === 0) return []

  const unitsPerF = blockInput.units_per_floor ? Number(blockInput.units_per_floor) : 0
  const prefix = blockInput.prefix || 'A'
  const bhkTemplates = Array.isArray(blockInput.bhk_templates) ? blockInput.bhk_templates : []
  const template = blockInput.nomenclature_template || null
  const pricePerSqft =
    blockInput.price_per_sqft !== undefined && blockInput.price_per_sqft !== null && blockInput.price_per_sqft !== ''
      ? Number(blockInput.price_per_sqft)
      : null

  const generated: FloorInputItem[] = []
  const floorCount = totalF > 0 ? totalF : maxCustomFloorNum

  for (let fNum = 1; fNum <= floorCount; fNum++) {
    const isGround = fNum === 1
    const existingFloor = customFloors.find((fl) => Number(fl.floor_number) === fNum)

    const floorName = existingFloor?.floor_name || (isGround ? 'Ground Floor' : `Floor ${fNum}`)
    const floorType = existingFloor?.floor_type || (isGround ? 'GROUND_FLOOR' : 'FLOOR')
    const isSellable = existingFloor?.is_sellable !== undefined ? Boolean(existingFloor.is_sellable) : true
    const description = existingFloor?.description || null

    const floorUnits: FloorInputItem['units'] = []
    const existingUnits = existingFloor?.units && Array.isArray(existingFloor.units) ? existingFloor.units : []

    if (isSellable && unitsPerF > 0) {
      for (let pos = 1; pos <= unitsPerF; pos++) {
        const existingUnit = existingUnits.find(
          (u) => Number(u.position) === pos || u.unit_number === generateUnitNumber(template, prefix, fNum, pos),
        )

        const assignedBHK = bhkTemplates.find((t) => t.positions?.some((p) => Number(p.position) === pos))
        const posObj = assignedBHK?.positions?.find((p) => Number(p.position) === pos)

        const unitNum = generateUnitNumber(template, prefix, fNum, pos)
        const unitType = assignedBHK?.type || existingUnit?.unit_type || '2BHK'
        const carpetArea =
          assignedBHK?.carpet_area !== undefined && assignedBHK?.carpet_area !== null
            ? Number(assignedBHK.carpet_area)
            : existingUnit?.carpet_area !== undefined && existingUnit?.carpet_area !== null
              ? Number(existingUnit.carpet_area)
              : null
        const sbaArea =
          assignedBHK?.super_built_up_area !== undefined && assignedBHK?.super_built_up_area !== null
            ? Number(assignedBHK.super_built_up_area)
            : existingUnit?.super_built_up_area !== undefined && existingUnit?.super_built_up_area !== null
              ? Number(existingUnit.super_built_up_area)
              : null
        const buaArea =
          assignedBHK?.built_up_area !== undefined && assignedBHK?.built_up_area !== null
            ? Number(assignedBHK.built_up_area)
            : existingUnit?.built_up_area !== undefined && existingUnit?.built_up_area !== null
              ? Number(existingUnit.built_up_area)
              : sbaArea
        const direction = posObj?.direction || existingUnit?.direction || null
        const viewFacing = posObj?.view_facing || existingUnit?.view_facing || null

        floorUnits.push({
          ...(existingUnit?.id ? { id: existingUnit.id } : {}),
          unit_number: unitNum,
          unit_type: unitType,
          position: pos,
          direction,
          view_facing: viewFacing,
          is_sellable: existingUnit?.is_sellable !== undefined ? Boolean(existingUnit.is_sellable) : true,
          carpet_area: carpetArea,
          built_up_area: buaArea,
          super_built_up_area: sbaArea,
          // Unit price follows the tower's price per sqft × super built-up area.
          price_per_sqft: pricePerSqft,
          price: pricePerSqft && sbaArea ? Math.round(sbaArea * pricePerSqft) : null,
          status: existingUnit?.status || 'available',
        })
      }
    } else if (existingUnits.length > 0) {
      floorUnits.push(...existingUnits)
    }

    generated.push({
      floor_number: fNum,
      floor_name: floorName,
      floor_type: floorType,
      is_sellable: isSellable,
      description,
      units: floorUnits,
    })
  }

  return generated
}

// ─── Nested JSON → physical rows ─────────────────────────────────────────────

type UnitInputItem = NonNullable<FloorInputItem['units']>[number]

interface PhysicalFloor extends FloorInputItem {
  is_virtual: boolean
}

interface PhysicalBlock {
  id?: string | undefined
  is_virtual: boolean
  block_name: string
  fields: Record<string, unknown>
  floors: PhysicalFloor[]
}

const toNumberOrNull = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v))

const blockFields = (input: Record<string, unknown>) => ({
  total_floors: toNumberOrNull(input.total_floors),
  units_per_floor: toNumberOrNull(input.units_per_floor),
  prefix: (input.prefix as string) || null,
  price_per_sqft: toNumberOrNull(input.price_per_sqft),
  nomenclature_template: (input.nomenclature_template as string) || null,
  bhk_templates: input.bhk_templates ?? null,
  description: (input.description as string) || null,
})

const asUnits = (units: unknown) => (Array.isArray(units) ? (units as UnitInputItem[]) : [])

const explicitFloor = (f: FloorInputItem): PhysicalFloor => ({
  ...f,
  floor_number: Number(f.floor_number),
  is_virtual: false,
  units: asUnits(f.units),
})

const hiddenFloor = (units: UnitInputItem[]): PhysicalFloor => ({
  floor_number: 1,
  floor_name: null,
  floor_type: 'VIRTUAL',
  is_sellable: true,
  is_virtual: true,
  units,
})

/** Expands one entity into the blocks/floors/units that are actually stored. */
export function expandEntity(entity: EntityInput): PhysicalBlock[] {
  const levels = entity.levels.join('>')
  const blocks = (entity.blocks ?? []) as Array<Record<string, unknown> & { id?: string; block_name: string }>

  if (levels === 'block>floor>unit') {
    return blocks.map((b) => ({
      id: b.id,
      is_virtual: false,
      block_name: b.block_name,
      fields: blockFields(b),
      floors: resolveBlockFloorsAndUnits(b as BlockInputItem).map((f) => ({ ...f, is_virtual: false })),
    }))
  }
  if (levels === 'block>unit') {
    return blocks.map((b) => ({
      id: b.id,
      is_virtual: false,
      block_name: b.block_name,
      fields: blockFields(b),
      floors: [hiddenFloor(asUnits(b.units))],
    }))
  }
  const hiddenBlock = (floors: PhysicalFloor[]): PhysicalBlock => ({
    is_virtual: true,
    block_name: entity.name,
    fields: blockFields({}),
    floors,
  })
  if (levels === 'floor>unit') {
    return [hiddenBlock((entity.floors ?? []).map((f) => explicitFloor(f as FloorInputItem)))]
  }
  // levels === 'unit'
  return [hiddenBlock([hiddenFloor(asUnits(entity.units))])]
}

const unitValues = (u: UnitInputItem, fallbackStatus?: string) => ({
  unit_number: u.unit_number.trim(),
  unit_type: (u.unit_type || '2BHK') as UnitType,
  position: u.position ? Number(u.position) : null,
  direction: u.direction || null,
  view_facing: u.view_facing || null,
  is_sellable: u.is_sellable ?? true,
  carpet_area: toNumberOrNull(u.carpet_area),
  built_up_area: toNumberOrNull(u.built_up_area),
  super_built_up_area: toNumberOrNull(u.super_built_up_area),
  area_unit: (u.area_unit || null) as UnitAreaUnit | null,
  facing: (u.facing || null) as UnitFacing | null,
  price: toNumberOrNull(u.price),
  price_per_sqft: toNumberOrNull(u.price_per_sqft),
  status: (u.status || fallbackStatus || 'available') as UnitStatus,
  attributes: u.attributes ?? null,
})

// ─── Sync ────────────────────────────────────────────────────────────────────

interface SyncOptions {
  /** Soft-delete entities of the property that aren't in the payload. Off for the legacy `blocks` payload. */
  pruneEntities: boolean
  userId: string | null
  transaction: Transaction
}

/**
 * Upserts the property's structure to match `entities`. Rows are matched by id first, then by
 * name/number, so ids (and the residents, tickets and bills linked to units) survive edits.
 * Removing a unit that still has residents is refused with 409.
 */
export async function syncPropertyStructure(propertyId: string, entities: EntityInput[], options: SyncOptions) {
  const { userId, transaction } = options
  const audit = { updatedBy: userId }
  const created = { isActive: true, isDeleted: false, createdBy: userId, updatedBy: userId }

  const [existingEntities, existingBlocks] = await Promise.all([
    PropertyEntity.findAll({ where: { propertyId, isDeleted: false }, transaction }),
    PropertyBlock.findAll({ where: { propertyId, isDeleted: false }, transaction }),
  ])
  const blockIds = existingBlocks.map((b) => b.id)
  const existingFloors = blockIds.length
    ? await PropertyFloor.findAll({ where: { blockId: { [Op.in]: blockIds }, isDeleted: false }, transaction })
    : []
  const floorIds = existingFloors.map((f) => f.id)
  const existingUnits = floorIds.length
    ? await PropertyUnit.findAll({ where: { floorId: { [Op.in]: floorIds }, isDeleted: false }, transaction })
    : []
  const unitsById = new Map(existingUnits.map((u) => [u.id, u]))
  const numberKey = (n: string) => n.trim().toLowerCase()

  const kept = {
    entities: new Set<string>(),
    blocks: new Set<string>(),
    floors: new Set<string>(),
    units: new Set<string>(),
  }
  const claimedUnits = new Set<string>()

  // Expand everything first so units the payload names by id are reserved before any
  // match-by-number fallback runs (otherwise a renumbered unit could be taken by another group).
  const expanded = entities.map((entity) => expandEntity(entity))
  const reservedIds = new Set(
    expanded.flatMap((blocks) =>
      blocks.flatMap((b) => b.floors.flatMap((f) => (f.units ?? []).map((u) => u.id).filter(Boolean))),
    ) as string[],
  )

  for (const [index, input] of entities.entries()) {
    const entityValues = {
      entity_type: input.entity_type,
      name: input.name.trim(),
      levels: input.levels,
      level_labels: (input.level_labels ?? null) as StructureLevelLabels | null,
      settings: input.settings ?? null,
      sort_order: input.sort_order ?? index,
    }
    let entity = input.id ? existingEntities.find((e) => e.id === input.id) : undefined
    if (entity) {
      await entity.update({ ...entityValues, ...audit }, { transaction })
    } else {
      entity = await PropertyEntity.create({ propertyId, ...entityValues, ...created }, { transaction })
    }
    kept.entities.add(entity.id)

    const entityBlocks = existingBlocks.filter((b) => b.entityId === entity.id)
    for (const [blockOrder, pBlock] of (expanded[index] ?? []).entries()) {
      let block =
        (pBlock.id && entityBlocks.find((b) => b.id === pBlock.id)) ||
        entityBlocks.find(
          (b) =>
            !kept.blocks.has(b.id) &&
            b.is_virtual === pBlock.is_virtual &&
            (pBlock.is_virtual || b.block_name === pBlock.block_name),
        )
      const values = {
        block_name: pBlock.block_name,
        is_virtual: pBlock.is_virtual,
        entityId: entity.id,
        sort_order: blockOrder,
        ...pBlock.fields,
      }
      if (block) {
        await block.update({ ...values, ...audit }, { transaction })
      } else {
        block = await PropertyBlock.create({ propertyId, ...values, ...created }, { transaction })
      }
      kept.blocks.add(block.id)

      const blockFloors = existingFloors.filter((f) => f.blockId === block.id)
      for (const pFloor of pBlock.floors) {
        let floor =
          (pFloor.id && blockFloors.find((f) => f.id === pFloor.id)) ||
          blockFloors.find(
            (f) =>
              !kept.floors.has(f.id) &&
              f.is_virtual === pFloor.is_virtual &&
              (pFloor.is_virtual || f.floor_number === pFloor.floor_number),
          )
        const floorValues = {
          floor_number: pFloor.floor_number,
          floor_name: pFloor.floor_name || null,
          floor_type: pFloor.floor_type || 'FLOOR',
          is_sellable: pFloor.is_sellable ?? true,
          is_virtual: pFloor.is_virtual,
          description: pFloor.description || null,
        }
        if (floor) {
          await floor.update({ ...floorValues, ...audit }, { transaction })
        } else {
          floor = await PropertyFloor.create({ blockId: block.id, ...floorValues, ...created }, { transaction })
        }
        kept.floors.add(floor.id)

        for (const unitInput of pFloor.units ?? []) {
          // A unit keeps its id even when it moves to another floor/block, so links to it survive.
          // Match by id, then by number on the same floor, then anywhere in the property.
          const key = numberKey(unitInput.unit_number)
          const free = (u: PropertyUnit | undefined) => (u && !claimedUnits.has(u.id) ? u : undefined)
          // Fallback matches must not take a unit another entry asks for by id.
          const unreserved = (u: PropertyUnit | undefined) => (u && !reservedIds.has(u.id) ? free(u) : undefined)
          const unit =
            free(unitInput.id ? unitsById.get(unitInput.id) : undefined) ||
            unreserved(
              existingUnits.find(
                (u) =>
                  u.floorId === floor.id &&
                  !claimedUnits.has(u.id) &&
                  !reservedIds.has(u.id) &&
                  numberKey(u.unit_number) === key,
              ),
            ) ||
            unreserved(
              existingUnits.find(
                (u) => !claimedUnits.has(u.id) && !reservedIds.has(u.id) && numberKey(u.unit_number) === key,
              ),
            )
          if (unit) {
            claimedUnits.add(unit.id)
            await unit.update({ floorId: floor.id, ...unitValues(unitInput, unit.status), ...audit }, { transaction })
            kept.units.add(unit.id)
          } else {
            const createdUnit = await PropertyUnit.create(
              { floorId: floor.id, ...unitValues(unitInput), ...created },
              { transaction },
            )
            kept.units.add(createdUnit.id)
          }
        }
      }
    }
  }

  // Only prune inside entities this payload owns (all of them, unless it's the legacy blocks payload).
  const inScope = (entityId: string | null) => options.pruneEntities || entityId === null || kept.entities.has(entityId)
  const scopedBlocks = existingBlocks.filter((b) => inScope(b.entityId))
  const scopedBlockIds = new Set(scopedBlocks.map((b) => b.id))
  const scopedFloors = existingFloors.filter((f) => scopedBlockIds.has(f.blockId))
  const scopedFloorIds = new Set(scopedFloors.map((f) => f.id))

  const unitsToRemove = existingUnits.filter((u) => scopedFloorIds.has(u.floorId) && !kept.units.has(u.id))
  if (unitsToRemove.length) {
    const occupied = await Resident.findAll({
      where: { unitId: { [Op.in]: unitsToRemove.map((u) => u.id) }, isDeleted: false },
      attributes: ['unitId'],
      transaction,
    })
    if (occupied.length) {
      const occupiedIds = new Set(occupied.map((r) => r.unitId))
      const occupiedUnits = unitsToRemove.filter((u) => occupiedIds.has(u.id))
      const names = occupiedUnits.map((u) => u.unit_number)
      // If a whole entity is being removed, say so: "Can't remove Villa: residents live in V-01".
      const blockOfFloor = new Map(existingFloors.map((f) => [f.id, f.blockId]))
      const entityOfBlock = new Map(existingBlocks.map((b) => [b.id, b.entityId]))
      const removedEntities = existingEntities.filter(
        (e) =>
          !kept.entities.has(e.id) &&
          occupiedUnits.some((u) => entityOfBlock.get(blockOfFloor.get(u.floorId) ?? '') === e.id),
      )
      const subject = removedEntities.length ? removedEntities.map((e) => e.name).join(', ') : names.join(', ')
      throw new HttpError(
        409,
        `Can't remove ${subject}: residents still live in ${names.join(', ')}. Move them out first.`,
      )
    }
  }

  const softDelete = { isDeleted: true, isActive: false, ...audit }
  const removeIds = async (
    model: typeof PropertyUnit | typeof PropertyFloor | typeof PropertyBlock | typeof PropertyEntity,
    ids: string[],
  ) => {
    if (ids.length)
      await (model as typeof PropertyUnit).update(softDelete, { where: { id: { [Op.in]: ids } }, transaction })
  }
  await removeIds(
    PropertyUnit,
    unitsToRemove.map((u) => u.id),
  )
  await removeIds(
    PropertyFloor,
    scopedFloors.filter((f) => !kept.floors.has(f.id)).map((f) => f.id),
  )
  await removeIds(
    PropertyBlock,
    scopedBlocks.filter((b) => !kept.blocks.has(b.id)).map((b) => b.id),
  )
  if (options.pruneEntities) {
    await removeIds(
      PropertyEntity,
      existingEntities.filter((e) => !kept.entities.has(e.id)).map((e) => e.id),
    )
  }
}

/**
 * The legacy payload `blocks: [...]` (towers only) as one block→floor→unit entity. It reuses the
 * property's existing tower entity so its id, and the other entities, are left alone.
 */
export async function legacyBlocksToEntity(
  propertyId: string,
  blocks: unknown[],
  transaction?: Transaction,
): Promise<EntityInput> {
  const candidates = await PropertyEntity.findAll({
    where: { propertyId, isDeleted: false },
    order: [['sort_order', 'ASC']],
    ...(transaction ? { transaction } : {}),
  })
  const towers = candidates.find((e) => e.levels?.join('>') === 'block>floor>unit')
  const usesTowers = Boolean(towers)
  return {
    ...(usesTowers && towers ? { id: towers.id, sort_order: towers.sort_order } : {}),
    entity_type: usesTowers && towers ? towers.entity_type : PropertyEntityType.APARTMENT,
    name: usesTowers && towers ? towers.name : 'Apartment',
    levels: [StructureLevel.BLOCK, StructureLevel.FLOOR, StructureLevel.UNIT],
    level_labels: usesTowers && towers ? towers.level_labels : { block: 'Tower' },
    blocks: blocks as EntityInput['blocks'],
  }
}

/** Runs a structure save in its own transaction. */
export async function saveStructure(
  propertyId: string,
  payload: { entities?: EntityInput[] | null; blocks?: unknown[] | null },
  userId: string | null,
) {
  if (!payload.entities && !payload.blocks) return
  await sequelize.transaction(async (transaction) => {
    if (payload.entities) {
      await syncPropertyStructure(propertyId, payload.entities, { pruneEntities: true, userId, transaction })
    } else if (payload.blocks) {
      const entity = await legacyBlocksToEntity(propertyId, payload.blocks, transaction)
      await syncPropertyStructure(propertyId, [entity], { pruneEntities: false, userId, transaction })
    }
  })
}

// ─── Physical rows → nested JSON ─────────────────────────────────────────────

type Plain = Record<string, unknown>
const plain = (row: unknown): Plain =>
  row && typeof (row as { toJSON?: () => Plain }).toJSON === 'function'
    ? (row as { toJSON: () => Plain }).toJSON()
    : (row as Plain)

const byNumber = (a: Plain, b: Plain) => Number(a.floor_number) - Number(b.floor_number)
const byUnit = (a: Plain, b: Plain) =>
  String(a.unit_number).localeCompare(String(b.unit_number), undefined, { numeric: true })

/** Blocks in their saved order (sort_order), then by name, so group numbering is stable. */
const byBlockOrder = (a: Plain, b: Plain) =>
  Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
  String(a.block_name).localeCompare(String(b.block_name), undefined, { numeric: true })

const sortedUnits = (floor: Plain) => ((floor.units as Plain[] | undefined) ?? []).slice().sort(byUnit)
const sortedFloors = (block: Plain) => ((block.floors as Plain[] | undefined) ?? []).slice().sort(byNumber)

/**
 * Builds the nested `entities` view from a property loaded with blocks → floors → units.
 * Hidden levels are collapsed, so a villa entity comes back as `{ levels: ['unit'], units: [...] }`.
 */
export function buildEntitiesView(entities: unknown[], blocks: unknown[]) {
  const blockRows = blocks.map(plain)
  const entityRows = entities.map(plain).sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))

  // Blocks added outside the entity flow (no entityId) still show up, under a default Apartment entity.
  const orphanBlocks = blockRows.filter((b) => !b.entityId || !entityRows.some((e) => e.id === b.entityId))
  if (orphanBlocks.length) {
    entityRows.push({
      id: null,
      entity_type: PropertyEntityType.APARTMENT,
      name: 'Apartment',
      levels: [StructureLevel.BLOCK, StructureLevel.FLOOR, StructureLevel.UNIT],
      level_labels: { block: 'Tower' },
      settings: null,
      sort_order: entityRows.length,
    })
  }

  return entityRows.map((entity) => {
    const own = (entity.id ? blockRows.filter((b) => b.entityId === entity.id) : orphanBlocks).sort(byBlockOrder)
    const levels = (entity.levels as string[]).join('>')
    const { id, entity_type, name, level_labels, settings, sort_order } = entity
    const base = { id, entity_type, name, levels: entity.levels, level_labels, settings, sort_order }
    const allFloors = own.flatMap(sortedFloors)

    if (levels === 'unit') return { ...base, units: allFloors.flatMap(sortedUnits).sort(byUnit) }
    if (levels === 'floor>unit') {
      return { ...base, floors: allFloors.map((f) => ({ ...f, units: sortedUnits(f) })) }
    }
    const visibleBlocks = own.filter((b) => !b.is_virtual)
    if (levels === 'block>unit') {
      return {
        ...base,
        blocks: visibleBlocks.map(({ floors, ...b }) => ({
          ...b,
          units: ((floors as Plain[] | undefined) ?? []).flatMap(sortedUnits).sort(byUnit),
        })),
      }
    }
    return {
      ...base,
      blocks: visibleBlocks.map((b) => ({
        ...b,
        floors: sortedFloors(b).map((f) => ({ ...f, units: sortedUnits(f) })),
      })),
    }
  })
}

// ─── Unit picker ─────────────────────────────────────────────────────────────

export interface UnitOption {
  id: string
  unit_number: string
  unit_type: string
  occupancyStatus: string
  /** "Towers · Tower A · Floor 2 · A-21" with hidden levels left out. */
  label: string
  entityId: string | null
  entityName: string
  blockId: string | null
  blockName: string | null
  floorId: string | null
  floorLabel: string | null
}

/** Flat list of every unit with readable labels, for pickers and filters. */
export function buildUnitOptions(entitiesView: ReturnType<typeof buildEntitiesView>): UnitOption[] {
  const options: UnitOption[] = []
  for (const entity of entitiesView) {
    const entityName = String(entity.name)
    const add = (unit: Plain, block: Plain | null, floor: Plain | null) => {
      const floorLabel = floor ? String(floor.floor_name || `Floor ${floor.floor_number}`) : null
      const blockName = block ? String(block.block_name) : null
      options.push({
        id: String(unit.id),
        unit_number: String(unit.unit_number),
        unit_type: String(unit.unit_type),
        occupancyStatus: String(unit.occupancyStatus ?? 'VACANT'),
        label: [entityName, blockName, floorLabel, String(unit.unit_number)].filter(Boolean).join(' · '),
        entityId: (entity.id as string | null) ?? null,
        entityName,
        blockId: block ? String(block.id) : null,
        blockName,
        floorId: floor && !floor.is_virtual ? String(floor.id) : null,
        floorLabel,
      })
    }
    const view = entity as Plain
    for (const unit of (view.units as Plain[] | undefined) ?? []) add(unit, null, null)
    for (const floor of (view.floors as Plain[] | undefined) ?? []) {
      for (const unit of (floor.units as Plain[] | undefined) ?? []) add(unit, null, floor)
    }
    for (const block of (view.blocks as Plain[] | undefined) ?? []) {
      for (const unit of (block.units as Plain[] | undefined) ?? []) add(unit, block, null)
      for (const floor of (block.floors as Plain[] | undefined) ?? []) {
        for (const unit of (floor.units as Plain[] | undefined) ?? []) add(unit, block, floor)
      }
    }
  }
  return options
}
