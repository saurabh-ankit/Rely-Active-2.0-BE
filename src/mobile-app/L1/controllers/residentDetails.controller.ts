/**
 * residentDetails.controller.ts
 *
 * GET /api/v1/mobile/l1/resident/details
 *
 * Returns a comprehensive resident detail object including:
 *  - Personal information (name, contact, photo, blood group, DOB, gender)
 *  - Unit & property details (unit number, floor, block, society address)
 *  - Family members (name, relation, contact, blood group)
 *  - Active food package (meal slots, dietary preferences)
 *  - Recent tickets (last 10, summary view)
 */

import type { Request, Response } from 'express'
import { Op } from 'sequelize'
import {
  FnbGlobalMealSlot,
  FnbGlobalPackage,
  FnbPropertyPackage,
  FnbResidentPackage,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  Ticket,
} from '../../../models/index.js'
import { verifyToken } from '../../../utils/jwt.js'

/* ── helpers ─────────────────────────────────────────────────────────── */

function buildUnitInclude() {
  return {
    model: PropertyUnit,
    as: 'unit',
    include: [
      {
        model: PropertyFloor,
        as: 'floor',
        include: [
          {
            model: PropertyBlock,
            as: 'block',
            include: [{ model: Property, as: 'property' }],
          },
        ],
      },
    ],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatUnit(unit: any) {
  if (!unit) return null
  const floor = unit.floor
  const block = floor?.block
  const property = block?.property

  return {
    id: unit.id,
    unitNumber: unit.unitNumber || unit.unit_number,
    floor: floor ? { id: floor.id, name: floor.name, number: floor.floorNumber } : null,
    block: block ? { id: block.id, name: block.name } : null,
    property: property
      ? {
          id: property.id,
          name: property.name,
          address: property.address,
          city: property.city,
          state: property.state,
          pincode: property.pincode,
          country: property.country,
          phone: property.phone,
          email: property.email,
        }
      : null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatMealSlots(pkg: any, slotMap: Map<string, string>) {
  if (!pkg?.propertyPackage?.globalPackage?.includedMealSlots) return []
  return (pkg.propertyPackage.globalPackage.includedMealSlots as string[]).map((slotId) => ({
    id: slotId,
    name: slotMap.get(slotId) || slotId,
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatFoodPackage(pkg: any, slotMap: Map<string, string>) {
  if (!pkg) return null
  const gp = pkg.propertyPackage?.globalPackage
  return {
    id: pkg.id,
    status: pkg.status,
    startDate: pkg.startDate,
    endDate: pkg.endDate,
    dietaryPreference: pkg.dietaryPreference,
    packageName: gp?.name || null,
    packageCode: gp?.code || null,
    dietaryType: gp?.dietaryType || null,
    mealSlots: formatMealSlots(pkg, slotMap),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTicket(t: any) {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    tatOption: t.tatOption,
    customTatDeadline: t.customTatDeadline,
    dueDate: t.dueDate,
    createdAt: t.createdAt,
    resolvedAt: t.resolvedAt,
    closedAt: t.closedAt,
  }
}

/* ── controller ─────────────────────────────────────────────────────── */

/**
 * GET /api/v1/mobile/l1/resident/details
 * Returns full resident details including personal info, unit, property,
 * family members, food package, and recent tickets.
 */
export async function getResidentDetails(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    const isFamilyMember = decoded.roles?.includes('RESIDENT_FAMILY_MEMBER')

    /* ── Resolve resident ── */
    let residentId: string
    let parentResident: Resident | null = null
    let familyMemberRecord: ResidentFamilyMember | null = null

    if (isFamilyMember) {
      familyMemberRecord = await ResidentFamilyMember.findByPk(decoded.userId)
      if (!familyMemberRecord) {
        res.status(404).json({ success: false, message: 'Family member not found' })
        return
      }
      residentId = familyMemberRecord.residentId
    } else {
      residentId = decoded.userId
    }

    /* ── Fetch primary resident with all associations ── */
    parentResident = await Resident.findByPk(residentId, {
      include: [
        buildUnitInclude(),
        { model: Property, as: 'property' },
        {
          model: ResidentFamilyMember,
          as: 'familyMembers',
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    if (!parentResident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    const familyMembers = (parentResident.familyMembers || []) as ResidentFamilyMember[]
    const familyMemberIds = familyMembers.map((fm) => fm.id)

    /* ── F&B Packages ── */
    const [globalSlots, activePackages] = await Promise.all([
      FnbGlobalMealSlot.findAll(),
      FnbResidentPackage.findAll({
        where: {
          [Op.or]: [
            { residentId: parentResident.id },
            ...(familyMemberIds.length > 0 ? [{ familyMemberId: familyMemberIds }] : []),
          ],
          status: ['active', 'ACTIVE', 'paused', 'PAUSED'],
        },
        include: [
          {
            model: FnbPropertyPackage,
            as: 'propertyPackage',
            include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
          },
        ],
      }),
    ])

    const slotMap = new Map<string, string>(globalSlots.filter((gs) => gs.id).map((gs) => [gs.id!, gs.name]))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let primaryPackage: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const familyPkgMap = new Map<string, any>()

    activePackages.forEach((pkgItem: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pkg = pkgItem as any
      if (pkg.familyMemberId) {
        familyPkgMap.set(pkg.familyMemberId, pkg)
      }
      if (pkg.residentId === parentResident!.id && !pkg.familyMemberId) {
        primaryPackage = pkg
      }
    })

    /* ── Recent Tickets (last 10) ── */
    const ticketWhere: Record<string, unknown> = {
      locId: parentResident.locId,
      [Op.or]: [{ residentId: parentResident.id }, { unitId: parentResident.unitId }],
    }

    const recentTickets = await Ticket.findAll({
      where: ticketWhere,
      order: [['createdAt', 'DESC']],
      limit: 10,
      attributes: [
        'id',
        'ticketNumber',
        'title',
        'description',
        'category',
        'priority',
        'status',
        'tatOption',
        'customTatDeadline',
        'dueDate',
        'createdAt',
        'resolvedAt',
        'closedAt',
      ],
    })

    /* ── Build response ── */
    const unitFormatted = formatUnit((parentResident as Resident & { unit?: PropertyUnit }).unit)

    // Who is the "current user" — primary resident or family member?
    const currentUser =
      isFamilyMember && familyMemberRecord
        ? {
            id: familyMemberRecord.id,
            accountType: 'FAMILY_MEMBER' as const,
            residentId: parentResident.id,
            relation: familyMemberRecord.relation,
            firstName: familyMemberRecord.firstName,
            lastName: familyMemberRecord.lastName,
            email: familyMemberRecord.email,
            phone: familyMemberRecord.phone,
            gender: familyMemberRecord.gender,
            dob: familyMemberRecord.dob,
            bloodGroup: familyMemberRecord.bloodGroup,
            photoUrl: familyMemberRecord.photoUrl,
            username: familyMemberRecord.username,
            isResiding: familyMemberRecord.isResiding,
            foodPackage: formatFoodPackage(familyPkgMap.get(familyMemberRecord.id) || primaryPackage, slotMap),
          }
        : {
            id: parentResident.id,
            accountType: 'PRIMARY_RESIDENT' as const,
            residentId: parentResident.id,
            firstName: parentResident.firstName,
            lastName: parentResident.lastName,
            email: parentResident.email,
            phone: parentResident.phone,
            gender: parentResident.gender,
            dob: parentResident.dob,
            bloodGroup: parentResident.bloodGroup,
            photoUrl: parentResident.photoUrl,
            username: parentResident.username,
            emergencyContact: parentResident.emergencyContact,
            residentType: parentResident.residentType,
            ownershipType: parentResident.ownershipType,
            isResiding: parentResident.isResiding,
            status: parentResident.status,
            moveInDate: parentResident.moveInDate,
            moveOutDate: parentResident.moveOutDate,
            foodPackage: formatFoodPackage(primaryPackage, slotMap),
          }

    res.status(200).json({
      success: true,
      message: 'Resident details fetched successfully',
      data: {
        /* ── Who is logged in ── */
        currentUser,

        /* ── Unit & property ── */
        unit: unitFormatted,
        unitId: parentResident.unitId,
        locId: parentResident.locId,

        /* ── Primary resident summary (always present) ── */
        primaryResident: {
          id: parentResident.id,
          firstName: parentResident.firstName,
          lastName: parentResident.lastName,
          email: parentResident.email,
          phone: parentResident.phone,
          emergencyContact: parentResident.emergencyContact,
          bloodGroup: parentResident.bloodGroup,
          photoUrl: parentResident.photoUrl,
          residentType: parentResident.residentType,
          ownershipType: parentResident.ownershipType,
          isResiding: parentResident.isResiding,
          status: parentResident.status,
          moveInDate: parentResident.moveInDate,
          moveOutDate: parentResident.moveOutDate,
          foodPackage: formatFoodPackage(primaryPackage, slotMap),
        },

        /* ── Family members ── */
        familyMembers: familyMembers.map((fm) => ({
          id: fm.id,
          firstName: fm.firstName,
          lastName: fm.lastName,
          relation: fm.relation,
          isResiding: fm.isResiding,
          gender: fm.gender,
          dob: fm.dob,
          phone: fm.phone,
          email: fm.email,
          username: fm.username,
          bloodGroup: fm.bloodGroup,
          photoUrl: fm.photoUrl,
          foodPackage: formatFoodPackage(familyPkgMap.get(fm.id) || primaryPackage, slotMap),
        })),

        /* ── Recent tickets (last 10) ── */
        recentTickets: recentTickets.map(formatTicket),

        /* ── Summary stats ── */
        stats: {
          totalFamilyMembers: familyMembers.length,
          totalRecentTickets: recentTickets.length,
          openTickets: recentTickets.filter((t) =>
            ['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(String(t.status).toUpperCase()),
          ).length,
          resolvedTickets: recentTickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(String(t.status).toUpperCase()))
            .length,
        },
      },
    })
  } catch (err) {
    console.error('Error fetching resident details:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch resident details' })
  }
}
