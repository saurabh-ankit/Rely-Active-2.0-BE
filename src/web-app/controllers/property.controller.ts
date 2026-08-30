import type { NextFunction, Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  Company,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  Role,
  User,
  UserLocation,
} from '../../models/index.js'
import type { UnitAreaUnit, UnitFacing, UnitStatus, UnitType } from '../../enums/propertyUnit.enum.js'

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
              },
            ],
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

interface BlockInputItem {
  total_floors?: number | string | null
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

function resolveBlockFloorsAndUnits(blockInput: BlockInputItem): FloorInputItem[] {
  const customFloors = Array.isArray(blockInput.floors) ? blockInput.floors : []
  const maxCustomFloorNum = customFloors.reduce((max, fl) => Math.max(max, Number(fl.floor_number) || 0), 0)
  const totalF = blockInput.total_floors ? Number(blockInput.total_floors) : maxCustomFloorNum

  if (totalF <= 0 && customFloors.length === 0) return []

  const unitsPerF = blockInput.units_per_floor ? Number(blockInput.units_per_floor) : 0
  const prefix = blockInput.prefix || 'A'
  const bhkTemplates = Array.isArray(blockInput.bhk_templates) ? blockInput.bhk_templates : []
  const template = blockInput.nomenclature_template || null

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

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

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
    }

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
          createdBy: operatingUserId,
          updatedBy: operatingUserId,
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

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    const { blocks: blocksInput, ...propertyFields } = req.body

    await existing.update({ ...propertyFields, updatedBy: operatingUserId })

    if (blocksInput && Array.isArray(blocksInput)) {
      const existingBlocks = await PropertyBlock.findAll({
        where: { propertyId: id, isDeleted: false },
      })

      const incomingBlockIds = blocksInput
        .map((b: { id?: string }) => b.id)
        .filter((bId): bId is string => Boolean(bId))

      // Soft-delete blocks that were removed in edit
      const blocksToDelete = existingBlocks.filter((b) => !incomingBlockIds.includes(b.id))
      for (const bToDelete of blocksToDelete) {
        await bToDelete.update({ isDeleted: true, isActive: false, updatedBy: operatingUserId })
      }

      for (const blockInput of blocksInput) {
        let block = blockInput.id
          ? existingBlocks.find((b) => b.id === blockInput.id)
          : existingBlocks.find((b) => b.block_name === blockInput.block_name)

        if (block) {
          await block.update({
            block_name: blockInput.block_name,
            total_floors: blockInput.total_floors ? Number(blockInput.total_floors) : null,
            units_per_floor: blockInput.units_per_floor ? Number(blockInput.units_per_floor) : null,
            prefix: blockInput.prefix || null,
            price_per_sqft: blockInput.price_per_sqft ? Number(blockInput.price_per_sqft) : null,
            nomenclature_template: blockInput.nomenclature_template || null,
            bhk_templates: blockInput.bhk_templates || null,
            description: blockInput.description || null,
            updatedBy: operatingUserId,
          })
        } else {
          block = await PropertyBlock.create({
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
            createdBy: operatingUserId,
            updatedBy: operatingUserId,
          })
        }

        const existingFloors = await PropertyFloor.findAll({
          where: { blockId: block.id, isDeleted: false },
        })

        const resolvedFloors = resolveBlockFloorsAndUnits(blockInput)
        const incomingFloorNumbers = resolvedFloors.map((f) => Number(f.floor_number))

        const floorsToDelete = existingFloors.filter((f) => !incomingFloorNumbers.includes(f.floor_number))
        for (const fToDelete of floorsToDelete) {
          await fToDelete.update({ isDeleted: true, isActive: false, updatedBy: operatingUserId })
        }

        for (const floorInput of resolvedFloors) {
          let floor = existingFloors.find((f) => f.floor_number === Number(floorInput.floor_number))

          if (floor) {
            await floor.update({
              floor_name: floorInput.floor_name || null,
              floor_type: floorInput.floor_type || 'FLOOR',
              is_sellable: floorInput.is_sellable ?? true,
              description: floorInput.description || null,
              updatedBy: operatingUserId,
            })
          } else {
            floor = await PropertyFloor.create({
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
          }

          if (floorInput.units && Array.isArray(floorInput.units)) {
            const existingUnits = await PropertyUnit.findAll({
              where: { floorId: floor.id, isDeleted: false },
            })

            const incomingUnitNumbers = floorInput.units.map((u) => u.unit_number)
            const incomingUnitIds = floorInput.units.map((u) => u.id).filter((uId): uId is string => Boolean(uId))

            const unitsToDelete = existingUnits.filter(
              (u) => !incomingUnitNumbers.includes(u.unit_number) && !incomingUnitIds.includes(u.id),
            )
            for (const uToDelete of unitsToDelete) {
              await uToDelete.update({ isDeleted: true, isActive: false, updatedBy: operatingUserId })
            }

            for (const unitInput of floorInput.units) {
              const unit = unitInput.id
                ? existingUnits.find((u) => u.id === unitInput.id)
                : existingUnits.find((u) => u.unit_number === unitInput.unit_number)

              if (unit) {
                await unit.update({
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
                  status: (unitInput.status || unit.status || 'available') as UnitStatus,
                  updatedBy: operatingUserId,
                })
              } else {
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

    const block = await PropertyBlock.create({
      propertyId,
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
