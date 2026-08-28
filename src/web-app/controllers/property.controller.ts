import type { NextFunction, Request, Response } from 'express'
import { Company, Property, PropertyBlock, PropertyFloor, PropertyUnit } from '../../models/index.js'
import type { UnitAreaUnit, UnitFacing, UnitStatus, UnitType } from '../../models/propertyUnit.model.js'

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
          },
        ],
      },
    ],
  },
]

interface FloorInputItem {
  floor_number: number
  floor_name?: string | null
  floor_type?: string
  is_sellable?: boolean
  description?: string | null
  units?: Array<{
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
  }>
}

function resolveBlockFloorsAndUnits(blockInput: {
  total_floors?: number | string | null
  units_per_floor?: number | string | null
  prefix?: string | null
  floors?: FloorInputItem[]
}): FloorInputItem[] {
  if (blockInput.floors && Array.isArray(blockInput.floors) && blockInput.floors.length > 0) {
    return blockInput.floors
  }

  const totalF = blockInput.total_floors ? Number(blockInput.total_floors) : 0
  const unitsPerF = blockInput.units_per_floor ? Number(blockInput.units_per_floor) : 0
  if (totalF <= 0) return []

  const prefix = blockInput.prefix || 'A'
  const generated: FloorInputItem[] = []

  for (let fNum = 1; fNum <= totalF; fNum++) {
    const isGround = fNum === 1
    const floorUnits = []

    if (!isGround && unitsPerF > 0) {
      for (let uNum = 1; uNum <= unitsPerF; uNum++) {
        const uNo = `${prefix}-${fNum}${String(uNum).padStart(2, '0')}`
        floorUnits.push({
          unit_number: uNo,
          unit_type: '2BHK',
          position: uNum,
          is_sellable: true,
          status: 'available',
        })
      }
    }

    generated.push({
      floor_number: fNum,
      floor_name: isGround ? 'Ground Floor' : `Floor ${fNum}`,
      floor_type: isGround ? 'GROUND_FLOOR' : 'FLOOR',
      is_sellable: !isGround,
      units: floorUnits,
    })
  }

  return generated
}

// ─── Create Property ─────────────────────────────────────────────────────────

export const createProperty = async (req: Request, res: Response, next: NextFunction) => {
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

    // ── Create top-level property ───────────────────────────────────────────
    const property = await Property.create({
      companyId: finalCompanyId,
      property_name,
      property_type: property_type || 'apartment',
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
    })

    // ── Optionally create nested blocks → floors → units ───────────────────
    if (blocks && Array.isArray(blocks)) {
      for (const blockInput of blocks) {
        const block = await PropertyBlock.create({
          propertyId: property.id,
          block_name: blockInput.block_name,
          total_floors: blockInput.total_floors ? Number(blockInput.total_floors) : null,
          units_per_floor: blockInput.units_per_floor ? Number(blockInput.units_per_floor) : null,
          prefix: blockInput.prefix || null,
          price_per_sqft: blockInput.price_per_sqft ? Number(blockInput.price_per_sqft) : null,
          nomenclature_template: blockInput.nomenclature_template || null,
          bhk_templates: blockInput.bhk_templates || null,
          description: blockInput.description || null,
          isActive: true,
          isDeleted: false,
        })

        const resolvedFloors = resolveBlockFloorsAndUnits(blockInput)
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
              })
            }
          }
        }
      }
    }

    // ── Return full nested response ─────────────────────────────────────────
    const result = await Property.findByPk(property.id, {
      include: propertyFullInclude,
    })

    return res.status(201).json({
      success: true,
      message: 'Property created successfully',
      data: result,
    })
  } catch (error) {
    next(error)
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
      data: properties,
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
      data: property,
    })
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

    const { blocks: blocksInput, ...propertyFields } = req.body

    await existing.update(propertyFields)

    if (blocksInput && Array.isArray(blocksInput)) {
      // Deactivate existing blocks for this property
      await PropertyBlock.update({ isDeleted: true, isActive: false }, { where: { propertyId: id, isDeleted: false } })

      for (const blockInput of blocksInput) {
        const block = await PropertyBlock.create({
          propertyId: id,
          block_name: blockInput.block_name,
          total_floors: blockInput.total_floors ? Number(blockInput.total_floors) : null,
          units_per_floor: blockInput.units_per_floor ? Number(blockInput.units_per_floor) : null,
          prefix: blockInput.prefix || null,
          price_per_sqft: blockInput.price_per_sqft ? Number(blockInput.price_per_sqft) : null,
          nomenclature_template: blockInput.nomenclature_template || null,
          bhk_templates: blockInput.bhk_templates || null,
          description: blockInput.description || null,
          isActive: true,
          isDeleted: false,
        })

        const resolvedFloors = resolveBlockFloorsAndUnits(blockInput)
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
              })
            }
          }
        }
      }
    }

    const updated = await Property.findByPk(id, { include: propertyFullInclude })

    return res.status(200).json({
      success: true,
      message: 'Property updated successfully',
      data: updated,
    })
  } catch (error) {
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

    await property.update({ isDeleted: true, isActive: false })

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

    const { block_name, total_floors, description, floors } = req.body
    if (!block_name) {
      return res.status(400).json({ success: false, message: 'block_name is required' })
    }

    const block = await PropertyBlock.create({
      propertyId,
      block_name,
      total_floors: total_floors ? Number(total_floors) : null,
      description: description || null,
      isActive: true,
      isDeleted: false,
    })

    // Optionally seed floors immediately
    if (floors && Array.isArray(floors)) {
      for (const floorInput of floors) {
        const floor = await PropertyFloor.create({
          blockId: block.id,
          floor_number: Number(floorInput.floor_number),
          floor_name: floorInput.floor_name || null,
          description: floorInput.description || null,
          isActive: true,
          isDeleted: false,
        })

        if (floorInput.units && Array.isArray(floorInput.units)) {
          for (const unitInput of floorInput.units) {
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
            })
          }
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
