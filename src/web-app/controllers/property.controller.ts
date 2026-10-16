import type { NextFunction, Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  Company,
  Property,
  PropertyBlock,
  PropertyEntity,
  PropertyFloor,
  PropertyUnit,
  Resident,
  Role,
  User,
  UserLocation,
} from '../../models/index.js'
import type { UnitAreaUnit, UnitFacing, UnitStatus, UnitType } from '../../enums/propertyUnit.enum.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import type { PropertyType } from '../../models/property.model.js'
import {
  buildEntitiesView,
  buildUnitOptions,
  legacyBlocksToEntity,
  resolveBlockFloorsAndUnits,
  saveStructure,
} from '../../services/propertyStructure.service.js'
import type { EntityInput } from '../../validations/property.validation.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Full nested include for a property with all blocks → floors → units */
const propertyFullInclude = [
  {
    model: PropertyBlock,
    as: 'blocks',
    where: { isDeleted: false },
    required: false,
    include: [
      {
        model: PropertyFloor,
        as: 'floors',
        where: { isDeleted: false },
        required: false,
        include: [
          {
            model: PropertyUnit,
            as: 'units',
            where: { isDeleted: false },
            required: false,
            include: [
              {
                model: Resident,
                as: 'residents',
                where: { isDeleted: false },
                required: false,
                // Never send credentials with the property structure.
                attributes: { exclude: ['passwordHash', 'username'] },
              },
            ],
          },
        ],
      },
    ],
  },
]

/** Property JSON plus the nested `entities` view of its structure. */
async function withStructure(property: Property) {
  const entities = await PropertyEntity.findAll({ where: { propertyId: property.id, isDeleted: false } })
  const json = property.toJSON() as unknown as Record<string, unknown>
  return { ...json, entities: buildEntitiesView(entities, (json.blocks as unknown[]) ?? []) }
}

/**
 * property_types lists every kind of entity the property contains. When a structure is sent the
 * entities are the truth; otherwise the given list is used. A lone legacy `property_type` from older
 * clients is accepted and turned into a one-item list.
 */
function resolveTypes(body: {
  property_type?: string | null
  property_types?: string[] | null
  entities?: EntityInput[] | null
}) {
  const types = (
    body.entities?.length
      ? Array.from(new Set(body.entities.map((e) => e.entity_type)))
      : Array.from(new Set(body.property_types?.length ? body.property_types : [body.property_type ?? 'apartment']))
  ) as PropertyType[]
  return { property_types: types.length ? types : (['apartment'] as PropertyType[]) }
}

const structureError = (res: Response, error: unknown) =>
  error instanceof HttpError ? res.status(error.status).json({ success: false, message: error.message }) : null

// ─── Create Property ─────────────────────────────────────────────────────────

export const createProperty = async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
  try {
    const {
      companyId,
      property_name,
      property_type,
      description,
      street,
      city,
      state,
      pincode,
      country,
      total_area,
      area_unit,
      amenities,
      launch_date,
      blocks,
      entities,
    } = req.body

    // ── Required field validation ───────────────────────────────────────────
    if (!property_name || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: 'property_name, city, state, and pincode are required',
      })
    }

    // ── Company resolution & validation ─────────────────────────────────────
    let finalCompanyId = companyId

    let existingCompany = finalCompanyId
      ? await Company.findOne({ where: { id: finalCompanyId, isDeleted: false } })
      : null

    if (!existingCompany) {
      // Fallback to first available company if provided ID is invalid or missing
      existingCompany = await Company.findOne({ where: { isDeleted: false } })
      if (existingCompany) {
        finalCompanyId = existingCompany.id
      } else {
        return res.status(400).json({
          success: false,
          message: 'No active company found in the system. Please create a company first.',
        })
      }
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    // ── Create top-level property ───────────────────────────────────────────
    const property = await Property.create({
      companyId: finalCompanyId,
      property_name,
      ...resolveTypes({ property_type, property_types: req.body.property_types, entities }),
      description: description || null,
      street: street || null,
      city,
      state,
      pincode,
      country: country || 'India',
      total_area: total_area ? Number(total_area) : null,
      area_unit: area_unit || null,
      amenities: amenities || null,
      launch_date: launch_date || null,
      isActive: true,
      isDeleted: false,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    // ── Auto-assign SuperAdmins to the new property ────────────────────────
    const superAdminRole = await Role.findOne({ where: { code: 'SUPER_ADMIN' } })
    const userLocationInclude: {
      model: typeof UserLocation
      as: string
      required: boolean
      where?: { roleId: string }
    } = {
      model: UserLocation,
      as: 'userLocations',
      required: false,
    }
    if (superAdminRole) {
      userLocationInclude.where = { roleId: superAdminRole.id }
    }

    const superAdminUsers = (await User.findAll({
      where: { isDeleted: false },
      include: [userLocationInclude],
    })) as Array<User & { userLocations?: UserLocation[] }>
    const superAdminUserIds = superAdminUsers
      .filter((u) => u.username === 'superadmin' || u.userLocations?.some((ul) => ul.roleId === superAdminRole?.id))
      .map((u) => u.id)

    if (operatingUserId && !superAdminUserIds.includes(operatingUserId)) {
      superAdminUserIds.push(operatingUserId)
    }

    for (const sUserId of superAdminUserIds) {
      try {
        const exists = await UserLocation.findOne({ where: { userId: sUserId, locId: property.id } })
        if (!exists) {
          await UserLocation.create({
            userId: sUserId,
            locId: property.id,
            roleId: superAdminRole?.id || null,
            companyId: property.companyId || null,
            createdBy: operatingUserId,
            updatedBy: operatingUserId,
          })
        }
      } catch (userLocErr) {
        // Safe fallback if user is already assigned or unique constraint exists
        console.warn('SuperAdmin user location auto-assignment warning:', userLocErr)
      }
    }

    // ── Structure: nested entities (or legacy towers-only blocks) ──────────
    try {
      await saveStructure(property.id, { entities, blocks }, operatingUserId)
    } catch (structureErr) {
      // Don't leave a half-created property behind.
      await property.update({ isDeleted: true, isActive: false })
      throw structureErr
    }

    // ── Return full nested response ─────────────────────────────────────────
    const result = await Property.findByPk(property.id, {
      include: propertyFullInclude,
    })

    return res.status(201).json({
      success: true,
      message: 'Property created successfully',
      data: result ? await withStructure(result) : null,
    })
  } catch (error) {
    if (structureError(res, error)) return
    console.error('CREATE PROPERTY ERROR:', error)
    return res.status(500).json({ success: false, error: (error as Error).message, stack: (error as Error).stack })
  }
}

// ─── Get All Properties ───────────────────────────────────────────────────────

export const getAllProperties = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companyId } = req.query

    const whereClause: Record<string, unknown> = { isDeleted: false }
    if (companyId) whereClause.companyId = companyId

    const properties = await Property.findAll({
      where: whereClause,
      include: propertyFullInclude,
      order: [['createdAt', 'DESC']],
    })

    return res.status(200).json({
      success: true,
      message: 'Properties fetched successfully',
      data: await Promise.all(properties.map(withStructure)),
    })
  } catch (error) {
    next(error)
  }
}

// ─── Get Property By ID ───────────────────────────────────────────────────────

export const getPropertyById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    if (!id) {
      return res.status(400).json({ success: false, message: 'Property ID is required' })
    }

    const property = await Property.findOne({
      where: { id, isDeleted: false },
      include: propertyFullInclude,
    })

    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' })
    }

    return res.status(200).json({
      success: true,
      message: 'Property fetched successfully',
      data: await withStructure(property),
    })
  } catch (error) {
    next(error)
  }
}

// ─── Unit picker ──────────────────────────────────────────────────────────────

/**
 * GET /property/:id/unit-picker
 * The structure without hidden levels plus a flat, labelled unit list, so every screen picks
 * flats the same way: Entity → (Block) → (Floor) → Unit.
 */
export const getUnitPicker = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const property = id
      ? await Property.findOne({ where: { id, isDeleted: false }, include: propertyFullInclude })
      : null
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' })
    }
    const { entities } = await withStructure(property)
    return res.status(200).json({ success: true, data: { entities, units: buildUnitOptions(entities) } })
  } catch (error) {
    next(error)
  }
}

// ─── Update Property ──────────────────────────────────────────────────────────

export const updateProperty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    if (!id) {
      return res.status(400).json({ success: false, message: 'Property ID is required' })
    }

    const existing = await Property.findOne({ where: { id, isDeleted: false } })
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Property not found' })
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    const { blocks: blocksInput, entities: entitiesInput, property_type: legacyType, ...propertyFields } = req.body

    if (entitiesInput || legacyType || propertyFields.property_types) {
      Object.assign(
        propertyFields,
        resolveTypes({
          property_type: legacyType,
          property_types: propertyFields.property_types ?? (legacyType ? null : existing.property_types),
          entities: entitiesInput,
        }),
      )
    }

    // Structure first: if it's refused (e.g. removing an occupied flat) nothing else changes either.
    await saveStructure(id, { entities: entitiesInput, blocks: blocksInput }, operatingUserId)
    await existing.update({ ...propertyFields, updatedBy: operatingUserId })

    const updated = await Property.findByPk(id, { include: propertyFullInclude })

    return res.status(200).json({
      success: true,
      message: 'Property updated successfully',
      data: updated ? await withStructure(updated) : null,
    })
  } catch (error) {
    if (structureError(res, error)) return
    next(error)
  }
}

// ─── Delete Property (soft) ───────────────────────────────────────────────────

export const deleteProperty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    if (!id) {
      return res.status(400).json({ success: false, message: 'Property ID is required' })
    }

    const property = await Property.findOne({ where: { id, isDeleted: false } })
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' })
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    await property.update({ isDeleted: true, isActive: false, updatedBy: operatingUserId })

    return res.status(200).json({ success: true, message: 'Property deleted successfully' })
  } catch (error) {
    next(error)
  }
}

// ─── Add Block to Property ────────────────────────────────────────────────────

/**
 * POST /property/:id/blocks
 * Body: { block_name, total_floors?, description?, floors?: [...] }
 */
export const addBlock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const propertyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' })
    }

    const property = await Property.findOne({ where: { id: propertyId, isDeleted: false } })
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' })
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    const {
      block_name,
      total_floors,
      units_per_floor,
      prefix,
      price_per_sqft,
      nomenclature_template,
      bhk_templates,
      description,
    } = req.body
    if (!block_name) {
      return res.status(400).json({ success: false, message: 'block_name is required' })
    }

    // New towers join the property's tower entity (created if the property has none yet).
    const towers = await legacyBlocksToEntity(propertyId, [])
    const entityId =
      towers.id ??
      (
        await PropertyEntity.create({
          propertyId,
          entity_type: towers.entity_type,
          name: towers.name,
          levels: towers.levels,
          level_labels: towers.level_labels ?? null,
          createdBy: operatingUserId,
          updatedBy: operatingUserId,
        })
      ).id

    const block = await PropertyBlock.create({
      propertyId,
      entityId,
      block_name,
      total_floors: total_floors ? Number(total_floors) : null,
      units_per_floor: units_per_floor ? Number(units_per_floor) : null,
      prefix: prefix || null,
      price_per_sqft: price_per_sqft ? Number(price_per_sqft) : null,
      nomenclature_template: nomenclature_template || null,
      bhk_templates: bhk_templates || null,
      description: description || null,
      isActive: true,
      isDeleted: false,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    const resolvedFloors = resolveBlockFloorsAndUnits(req.body)
    for (const floorInput of resolvedFloors) {
      const floor = await PropertyFloor.create({
        blockId: block.id,
        floor_number: Number(floorInput.floor_number),
        floor_name: floorInput.floor_name || null,
        floor_type: floorInput.floor_type || 'FLOOR',
        is_sellable: floorInput.is_sellable ?? true,
        description: floorInput.description || null,
        isActive: true,
        isDeleted: false,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      })

      if (floorInput.units && Array.isArray(floorInput.units)) {
        for (const unitInput of floorInput.units) {
          await PropertyUnit.create({
            floorId: floor.id,
            unit_number: unitInput.unit_number,
            unit_type: (unitInput.unit_type || '2BHK') as UnitType,
            position: unitInput.position ? Number(unitInput.position) : null,
            direction: unitInput.direction || null,
            view_facing: unitInput.view_facing || null,
            is_sellable: unitInput.is_sellable ?? true,
            carpet_area: unitInput.carpet_area ? Number(unitInput.carpet_area) : null,
            built_up_area: unitInput.built_up_area ? Number(unitInput.built_up_area) : null,
            super_built_up_area: unitInput.super_built_up_area ? Number(unitInput.super_built_up_area) : null,
            area_unit: (unitInput.area_unit || null) as UnitAreaUnit | null,
            facing: (unitInput.facing || null) as UnitFacing | null,
            price: unitInput.price ? Number(unitInput.price) : null,
            price_per_sqft: unitInput.price_per_sqft ? Number(unitInput.price_per_sqft) : null,
            status: (unitInput.status || 'available') as UnitStatus,
            isActive: true,
            isDeleted: false,
            createdBy: operatingUserId,
            updatedBy: operatingUserId,
          })
        }
      }
    }

    const result = await PropertyBlock.findByPk(block.id, {
      include: [
        {
          model: PropertyFloor,
          as: 'floors',
          where: { isDeleted: false },
          required: false,
          include: [
            {
              model: PropertyUnit,
              as: 'units',
              where: { isDeleted: false },
              required: false,
            },
          ],
        },
      ],
    })

    return res.status(201).json({
      success: true,
      message: 'Block added successfully',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ─── Add Floor to Block ───────────────────────────────────────────────────────

/**
 * POST /property/blocks/:blockId/floors
 * Body: { floor_number, floor_name?, description?, units?: [...] }
 */
export const addFloor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blockId = Array.isArray(req.params.blockId) ? req.params.blockId[0] : req.params.blockId
    if (!blockId) {
      return res.status(400).json({ success: false, message: 'Block ID is required' })
    }

    const block = await PropertyBlock.findOne({ where: { id: blockId, isDeleted: false } })
    if (!block) {
      return res.status(404).json({ success: false, message: 'Block not found' })
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    const { floor_number, floor_name, description, units } = req.body
    if (floor_number === undefined || floor_number === null) {
      return res.status(400).json({ success: false, message: 'floor_number is required' })
    }

    const floor = await PropertyFloor.create({
      blockId,
      floor_number: Number(floor_number),
      floor_name: floor_name || null,
      description: description || null,
      isActive: true,
      isDeleted: false,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    // Optionally seed units immediately
    if (units && Array.isArray(units)) {
      for (const unitInput of units) {
        await PropertyUnit.create({
          floorId: floor.id,
          unit_number: unitInput.unit_number,
          unit_type: unitInput.unit_type || '2BHK',
          carpet_area: unitInput.carpet_area ? Number(unitInput.carpet_area) : null,
          built_up_area: unitInput.built_up_area ? Number(unitInput.built_up_area) : null,
          super_built_up_area: unitInput.super_built_up_area ? Number(unitInput.super_built_up_area) : null,
          area_unit: unitInput.area_unit || null,
          facing: unitInput.facing || null,
          price: unitInput.price ? Number(unitInput.price) : null,
          price_per_sqft: unitInput.price_per_sqft ? Number(unitInput.price_per_sqft) : null,
          status: unitInput.status || 'available',
          isActive: true,
          isDeleted: false,
          createdBy: operatingUserId,
          updatedBy: operatingUserId,
        })
      }
    }

    const result = await PropertyFloor.findByPk(floor.id, {
      include: [
        {
          model: PropertyUnit,
          as: 'units',
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    return res.status(201).json({
      success: true,
      message: 'Floor added successfully',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ─── Add Unit to Floor ────────────────────────────────────────────────────────

/**
 * POST /property/floors/:floorId/units
 * Body: { unit_number, unit_type, carpet_area, built_up_area,
 *          super_built_up_area, area_unit, facing, price, price_per_sqft, status }
 */
export const addUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const floorId = Array.isArray(req.params.floorId) ? req.params.floorId[0] : req.params.floorId
    if (!floorId) {
      return res.status(400).json({ success: false, message: 'Floor ID is required' })
    }

    const floor = await PropertyFloor.findOne({ where: { id: floorId, isDeleted: false } })
    if (!floor) {
      return res.status(404).json({ success: false, message: 'Floor not found' })
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    const {
      unit_number,
      unit_type,
      carpet_area,
      built_up_area,
      super_built_up_area,
      area_unit,
      facing,
      price,
      price_per_sqft,
      status,
    } = req.body

    if (!unit_number) {
      return res.status(400).json({ success: false, message: 'unit_number is required' })
    }

    const unit = await PropertyUnit.create({
      floorId,
      unit_number,
      unit_type: unit_type || '2BHK',
      carpet_area: carpet_area ? Number(carpet_area) : null,
      built_up_area: built_up_area ? Number(built_up_area) : null,
      super_built_up_area: super_built_up_area ? Number(super_built_up_area) : null,
      area_unit: area_unit || null,
      facing: facing || null,
      price: price ? Number(price) : null,
      price_per_sqft: price_per_sqft ? Number(price_per_sqft) : null,
      status: status || 'available',
      isActive: true,
      isDeleted: false,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    return res.status(201).json({
      success: true,
      message: 'Unit added successfully',
      data: unit,
    })
  } catch (error) {
    next(error)
  }
}
