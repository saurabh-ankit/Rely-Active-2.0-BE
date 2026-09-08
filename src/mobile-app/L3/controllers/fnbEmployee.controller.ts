import type { NextFunction, Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  User,
  UserDetail,
  FnbFoodDelivery,
  FnbResidentOrder,
  FnbResidentOrderDetail,
  FnbDish,
  FnbGlobalMealSlot,
  FnbPropertyMealSlot,
  FnbPropertySpecialSlot,
  FnbFoodAttendance,
  FnbResidentPackage,
  FnbPropertyPackage,
  FnbGlobalPackage,
} from '../../../models/index.js'
import { uploadBase64ToS3 } from '../../../middlewares/s3/index.js'
import { FnbSubscriptionStatus } from '../../../enums/fnb.enum.js'
import sequelize from '../../../config/db/index.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTimeToMinutes(tStr?: string, isEndTime = false): number {
  if (!tStr) return isEndTime ? 1440 : 0
  let clean = tStr.trim().toLowerCase()
  if (clean.includes('-')) {
    const parts = clean.split('-')
    clean = (isEndTime ? parts[1] || parts[0] : parts[0])?.trim() || clean
  }
  let isPM = false
  let isAM = false
  if (clean.includes('pm')) {
    isPM = true
    clean = clean.replace('pm', '').trim()
  } else if (clean.includes('am')) {
    isAM = true
    clean = clean.replace('am', '').trim()
  }
  const parts = clean.split(':')
  let hours = parseInt(parts[0] || '0', 10)
  const minutes = parseInt(parts[1] || '0', 10)
  if (isNaN(hours)) hours = 0
  if (isPM && hours < 12) hours += 12
  else if (isAM && hours === 12) hours = 0
  let totalMin = hours * 60 + (isNaN(minutes) ? 0 : minutes)
  if (isEndTime && (totalMin === 0 || clean === '00:00' || clean === '00:00:00' || clean === '24:00')) {
    totalMin = 1440
  }
  return totalMin
}

function getUnitFullLocation(unit?: Record<string, unknown> | null): string {
  if (!unit) return 'N/A'
  const parts: string[] = []
  const floorObj = unit.floor as Record<string, unknown> | undefined
  const blockObj = floorObj?.block as Record<string, unknown> | undefined
  const blockName = blockObj?.block_name as string | undefined
  if (blockName) {
    parts.push(
      blockName.toLowerCase().startsWith('block') || blockName.toLowerCase().startsWith('tower')
        ? blockName
        : `Block ${blockName}`,
    )
  }
  const floorName =
    (floorObj?.floor_name as string | undefined) ||
    (floorObj?.floor_number !== undefined ? `Floor ${String(floorObj.floor_number)}` : '')
  if (floorName) parts.push(floorName)
  const unitNum = (unit.unit_number || unit.unitNumber) as string | undefined
  if (unitNum) parts.push(`Flat ${unitNum}`)
  return parts.length > 0 ? parts.join(', ') : unitNum || 'N/A'
}

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

// ─── Property & Meal Slots ───────────────────────────────────────────────────

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

export async function getPropertyMealSlots(req: Request, res: Response): Promise<void> {
  try {
    const locId =
      (req.params.locId as string) ||
      (req.query.locId as string) ||
      (req.query.locationId as string) ||
      (req.headers['x-location-id'] as string) ||
      (req.headers['x-property-id'] as string)

    if (!locId) {
      res.status(400).json({ success: false, message: 'locId is required' })
      return
    }

    const pSlots = await FnbPropertyMealSlot.findAll({
      where: { locId },
      include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
    })

    const formatted = pSlots
      .map((ps) => {
        const plain = ps.get({ plain: true }) as Record<string, unknown> & {
          globalMealSlot?: Record<string, unknown>
        }
        const g = plain.globalMealSlot
        return {
          id: plain.id as string,
          locId: plain.locId as string,
          globalMealSlotId: plain.globalMealSlotId as string,
          name: (g?.name as string) || 'Meal Slot',
          code: (g?.code as string) || 'SLOT',
          description: (g?.description as string) || null,
          startTime: (plain.startTime as string) || (g?.startTime as string) || '07:30',
          endTime: (plain.endTime as string) || (g?.endTime as string) || '10:00',
          price: plain.price !== null && plain.price !== undefined ? Number(plain.price) : Number(g?.price || 0),
          globalStartTime: (g?.startTime as string) || '07:30',
          globalEndTime: (g?.endTime as string) || '10:00',
          globalPrice: Number(g?.price || 0),
          isActive: plain.isActive as boolean,
        }
      })
      .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime))

    res.status(200).json({
      success: true,
      data: formatted,
    })
  } catch (error) {
    console.error('Error fetching property meal slots:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch property meal slots' })
  }
}

export async function getGlobalMealSlots(req: Request, res: Response): Promise<void> {
  try {
    const slots = await FnbGlobalMealSlot.findAll({
      include: [{ model: FnbPropertyMealSlot, as: 'propertyMealSlots' }],
    })

    const formatted = slots
      .map((s) => {
        const plain = s.get({ plain: true }) as Record<string, unknown> & {
          startTime?: string
          price?: number
          propertyMealSlots?: unknown[]
        }
        return {
          ...plain,
          price: Number(plain.price || 0),
          assignedPropertyCount: plain.propertyMealSlots?.length || 0,
        }
      })
      .sort((a, b) => parseTimeToMinutes(a.startTime || '') - parseTimeToMinutes(b.startTime || ''))

    res.status(200).json({
      success: true,
      data: formatted,
    })
  } catch (error) {
    console.error('Error fetching global meal slots:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch global meal slots' })
  }
}

// ─── Attendance & Members Operations ─────────────────────────────────────────

export const getResidingMembersAndFlats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { locId, date: dateQuery, search, mealSlotKey } = req.query
    if (!locId) {
      res.status(400).json({ success: false, message: 'Property locId is required' })
      return
    }

    const targetDate = typeof dateQuery === 'string' && dateQuery ? dateQuery : new Date().toISOString().split('T')[0]!

    // 1. Fetch active residing primary residents for property
    const residents = await Resident.findAll({
      where: {
        locId: String(locId),
        isResiding: true,
        isDeleted: false,
      },
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              include: [{ model: PropertyBlock, as: 'block' }],
            },
          ],
        },
        {
          model: FnbResidentPackage,
          as: 'fnbPackages',
          where: { status: FnbSubscriptionStatus.ACTIVE },
          required: false,
          include: [
            {
              model: FnbPropertyPackage,
              as: 'propertyPackage',
              include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
            },
          ],
        },
      ],
    })

    // 2. Fetch active residing family members for property
    const familyMembers = await ResidentFamilyMember.findAll({
      where: {
        isResiding: true,
        isDeleted: false,
      },
      include: [
        {
          model: Resident,
          as: 'resident',
          where: {
            locId: String(locId),
            isDeleted: false,
          },
          required: true,
          include: [
            {
              model: PropertyUnit,
              as: 'unit',
              include: [
                {
                  model: PropertyFloor,
                  as: 'floor',
                  include: [{ model: PropertyBlock, as: 'block' }],
                },
              ],
            },
          ],
        },
        {
          model: FnbResidentPackage,
          as: 'fnbPackages',
          where: { status: FnbSubscriptionStatus.ACTIVE },
          required: false,
          include: [
            {
              model: FnbPropertyPackage,
              as: 'propertyPackage',
              include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
            },
          ],
        },
      ],
    })

    // 3. Fetch existing attendance records for location & date
    const attendances = await FnbFoodAttendance.findAll({
      where: {
        locId: String(locId),
        date: targetDate,
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'email'],
          include: [
            {
              model: UserDetail,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'employeeCode'],
            },
          ],
        },
        {
          model: FnbPropertyMealSlot,
          as: 'mealSlot',
          attributes: ['id', 'startTime', 'endTime', 'globalMealSlotId'],
          include: [
            {
              model: FnbGlobalMealSlot,
              as: 'globalMealSlot',
              attributes: ['id', 'name', 'startTime', 'endTime'],
            },
          ],
        },
      ],
    })

    // Fetch all global meal slots to build ID/name -> slotKey lookup map
    const globalSlots = await FnbGlobalMealSlot.findAll()
    const slotLookupMap = new Map<string, string>()
    globalSlots.forEach((gs) => {
      const normKey = gs.name.toLowerCase().replace(/\s+/g, '_')
      slotLookupMap.set(gs.id, normKey)
      slotLookupMap.set(gs.name.toLowerCase(), normKey)
    })

    // Helper to extract allowed package meal slots
    const extractAllowedMealSlots = (fnbPackages?: FnbResidentPackage[]): string[] => {
      if (!fnbPackages || fnbPackages.length === 0) return []
      const activePkg = fnbPackages[0]
      const included = activePkg?.propertyPackage?.globalPackage?.includedMealSlots
      if (Array.isArray(included) && included.length > 0) {
        const slotKeys: string[] = []
        included.forEach((slotItem) => {
          const rawStr = String(slotItem).toLowerCase()
          const mappedKey = slotLookupMap.get(slotItem) || slotLookupMap.get(rawStr)
          const keyToAdd = mappedKey || rawStr.replace(/\s+/g, '_')
          if (!slotKeys.includes(keyToAdd)) {
            slotKeys.push(keyToAdd)
          }
        })
        return slotKeys
      }
      return ['breakfast', 'lunch', 'evening_snacks', 'dinner']
    }

    const currentSlotKey =
      typeof mealSlotKey === 'string' && mealSlotKey.trim() ? mealSlotKey.trim().toLowerCase() : 'breakfast'

    // Map primary residents
    const mappedResidents = residents.map((r: Resident) => {
      const fnbPackages = r.fnbPackages
      const hasPkg = Boolean(fnbPackages && fnbPackages.length > 0)
      const allowedSlots = extractAllowedMealSlots(fnbPackages)
      const memberAttendances = attendances.filter((a: FnbFoodAttendance) => {
        const resId = a.residentId || (a as unknown as Record<string, unknown>).resident_id
        return Boolean(resId && r.id && String(resId).toLowerCase() === String(r.id).toLowerCase())
      })
      const plainMemberAttendances = memberAttendances.map((a: FnbFoodAttendance) => {
        const plain = (typeof a.get === 'function' ? a.get({ plain: true }) : a) as unknown as Record<string, unknown>
        let mKey = (plain.mealSlotKey || plain.meal_slot_key) as string | undefined
        if (!mKey || mKey === 'slot') {
          const globalMealSlot = plain.globalMealSlot as Record<string, unknown> | undefined
          const mealSlot = plain.mealSlot as Record<string, unknown> | undefined
          const mealSlotGlobal = mealSlot?.globalMealSlot as Record<string, unknown> | undefined
          const gName = (
            (globalMealSlot?.name as string) ||
            (mealSlotGlobal?.name as string) ||
            (mealSlot?.name as string) ||
            ''
          ).toLowerCase()
          if (gName.includes('break') || gName.includes('fast') || gName.includes('morn')) mKey = 'breakfast'
          else if (gName.includes('lunch') || gName.includes('noon')) mKey = 'lunch'
          else if (gName.includes('snack') && !gName.includes('night') && !gName.includes('mid'))
            mKey = 'evening_snacks'
          else if (gName.includes('dinner') || gName.includes('dinn')) mKey = 'dinner'
          else if (gName.includes('night') || gName.includes('mid') || gName.includes('late')) mKey = 'midnight_snacks'
          else if (gName) mKey = gName.replace(/\s+/g, '_')
          else if (plain.mealSlotId || plain.meal_slot_id)
            mKey = slotLookupMap.get(String(plain.mealSlotId || plain.meal_slot_id)) || ''
        }
        return {
          ...plain,
          id: plain.id,
          locId: plain.locId || plain.loc_id,
          residentId: plain.residentId || plain.resident_id,
          familyMemberId: plain.familyMemberId || plain.family_member_id,
          mealSlotId: plain.mealSlotId || plain.meal_slot_id,
          mealSlotKey: mKey,
          status: plain.status,
          attended: plain.status === 'attended',
          attendedAt: plain.attendedAt || plain.createdAt || plain.created_at,
          createdAt: plain.createdAt || plain.created_at,
        }
      })
      const currentAttendance = plainMemberAttendances.find(
        (a) => a.mealSlotKey && String(a.mealSlotKey).toLowerCase() === currentSlotKey,
      )
      const curAtt = currentAttendance as Record<string, unknown> | undefined
      const isAttended = Boolean(
        curAtt && (curAtt.status === 'attended' || curAtt.attended === true || curAtt.attendedAt),
      )
      const isSlotIncluded = hasPkg ? allowedSlots.length === 0 || allowedSlots.includes(currentSlotKey) : false
      const unitObj = r.unit as PropertyUnit | undefined
      const fullLoc = getUnitFullLocation(unitObj as unknown as Record<string, unknown>)
      const uNum = (unitObj?.unit_number || '') as string
      const creatorObj = curAtt?.creator as Record<string, unknown> | undefined
      const creatorProfile = creatorObj?.profile as Record<string, unknown> | undefined

      return {
        id: r.id,
        memberId: r.id,
        memberType: 'resident' as const,
        residentId: r.id,
        familyMemberId: null,
        unitId: r.unitId,
        firstName: r.firstName,
        lastName: r.lastName || '',
        name: `${r.firstName} ${r.lastName || ''}`.trim(),
        fullName: `${r.firstName} ${r.lastName || ''}`.trim(),
        phone: r.phone || '',
        photoUrl: r.photoUrl || null,
        unitNumber: uNum,
        flatNumber: uNum,
        locationString: fullLoc,
        fullLocation: fullLoc,
        dietaryPreference: fnbPackages?.[0]?.dietaryPreference || 'veg',
        packageName: fnbPackages?.[0]?.propertyPackage?.globalPackage?.name || null,
        hasActivePackage: hasPkg,
        allowedMealSlots: allowedSlots,
        isSlotIncludedInPackage: isSlotIncluded,
        attendance: curAtt
          ? {
              id: curAtt.id as string,
              attended: isAttended,
              attendedAt: (curAtt.attendedAt || curAtt.createdAt) as string | Date,
              mealSlotKey: (curAtt.mealSlotKey as string) || null,
              orderId: (curAtt.orderId as string) || null,
              created_by: (curAtt.createdBy as string) || null,
              created_by_user: creatorObj
                ? {
                    id: creatorObj.id as string,
                    firstName: (creatorProfile?.firstName || creatorObj.username || '') as string,
                    lastName: (creatorProfile?.lastName || '') as string,
                  }
                : null,
            }
          : null,
        attendances: plainMemberAttendances,
      }
    })

    // Map family members
    const mappedFamilyMembers = familyMembers.map((fm: ResidentFamilyMember) => {
      const fnbPackages = fm.fnbPackages
      const hasPkg = Boolean(fnbPackages && fnbPackages.length > 0)
      const allowedSlots = extractAllowedMealSlots(fnbPackages)
      const memberAttendances = attendances.filter((a: FnbFoodAttendance) => {
        const fmId = a.familyMemberId || (a as unknown as Record<string, unknown>).family_member_id
        return Boolean(fmId && fm.id && String(fmId).toLowerCase() === String(fm.id).toLowerCase())
      })
      const plainMemberAttendances = memberAttendances.map((a: FnbFoodAttendance) => {
        const plain = (typeof a.get === 'function' ? a.get({ plain: true }) : a) as unknown as Record<string, unknown>
        let mKey = (plain.mealSlotKey || plain.meal_slot_key) as string | undefined
        if (!mKey || mKey === 'slot') {
          const globalMealSlot = plain.globalMealSlot as Record<string, unknown> | undefined
          const mealSlot = plain.mealSlot as Record<string, unknown> | undefined
          const mealSlotGlobal = mealSlot?.globalMealSlot as Record<string, unknown> | undefined
          const gName = (
            (globalMealSlot?.name as string) ||
            (mealSlotGlobal?.name as string) ||
            (mealSlot?.name as string) ||
            ''
          ).toLowerCase()
          if (gName.includes('break') || gName.includes('fast') || gName.includes('morn')) mKey = 'breakfast'
          else if (gName.includes('lunch') || gName.includes('noon')) mKey = 'lunch'
          else if (gName.includes('snack') && !gName.includes('night') && !gName.includes('mid'))
            mKey = 'evening_snacks'
          else if (gName.includes('dinner') || gName.includes('dinn')) mKey = 'dinner'
          else if (gName.includes('night') || gName.includes('mid') || gName.includes('late')) mKey = 'midnight_snacks'
          else if (gName) mKey = gName.replace(/\s+/g, '_')
          else if (plain.mealSlotId || plain.meal_slot_id)
            mKey = slotLookupMap.get(String(plain.mealSlotId || plain.meal_slot_id)) || ''
        }
        return {
          ...plain,
          id: plain.id,
          locId: plain.locId || plain.loc_id,
          residentId: plain.residentId || plain.resident_id,
          familyMemberId: plain.familyMemberId || plain.family_member_id,
          mealSlotId: plain.mealSlotId || plain.meal_slot_id,
          mealSlotKey: mKey,
          status: plain.status,
          attended: plain.status === 'attended',
          attendedAt: plain.attendedAt || plain.createdAt || plain.created_at,
          createdAt: plain.createdAt || plain.created_at,
        }
      })
      const currentAttendance = plainMemberAttendances.find(
        (a) => a.mealSlotKey && String(a.mealSlotKey).toLowerCase() === currentSlotKey,
      )
      const curAtt = currentAttendance as Record<string, unknown> | undefined
      const isAttended = Boolean(
        curAtt && (curAtt.status === 'attended' || curAtt.attended === true || curAtt.attendedAt),
      )
      const isSlotIncluded = hasPkg ? allowedSlots.length === 0 || allowedSlots.includes(currentSlotKey) : false
      const resObj = fm.resident
      const resUnit = resObj?.unit as PropertyUnit | undefined
      const fullLoc = getUnitFullLocation(resUnit as unknown as Record<string, unknown>)
      const uNum = (resUnit?.unit_number || '') as string
      const creatorObj = curAtt?.creator as Record<string, unknown> | undefined
      const creatorProfile = creatorObj?.profile as Record<string, unknown> | undefined

      return {
        id: fm.id,
        memberId: fm.id,
        memberType: 'family' as const,
        residentId: fm.residentId,
        familyMemberId: fm.id,
        unitId: (resUnit?.id as string) || (resObj?.unitId as string) || null,
        firstName: fm.firstName,
        lastName: fm.lastName || '',
        name: `${fm.firstName} ${fm.lastName || ''}`.trim(),
        fullName: `${fm.firstName} ${fm.lastName || ''}`.trim(),
        relation: fm.relation || 'Family Member',
        phone: (fm.phone as string) || (resObj?.phone as string) || '',
        photoUrl: fm.photoUrl || null,
        unitNumber: uNum,
        flatNumber: uNum,
        locationString: fullLoc,
        fullLocation: fullLoc,
        dietaryPreference: fnbPackages?.[0]?.dietaryPreference || 'veg',
        packageName: fnbPackages?.[0]?.propertyPackage?.globalPackage?.name || null,
        hasActivePackage: hasPkg,
        allowedMealSlots: allowedSlots,
        isSlotIncludedInPackage: isSlotIncluded,
        attendance: curAtt
          ? {
              id: curAtt.id as string,
              attended: isAttended,
              attendedAt: (curAtt.attendedAt || curAtt.createdAt) as string | Date,
              mealSlotKey: (curAtt.mealSlotKey as string) || null,
              orderId: (curAtt.orderId as string) || null,
              created_by: (curAtt.createdBy as string) || null,
              created_by_user: creatorObj
                ? {
                    id: creatorObj.id as string,
                    firstName: (creatorProfile?.firstName || creatorObj.username || '') as string,
                    lastName: (creatorProfile?.lastName || '') as string,
                  }
                : null,
            }
          : null,
        attendances: plainMemberAttendances,
      }
    })

    type MemberRecord = (typeof mappedResidents)[number] | (typeof mappedFamilyMembers)[number]
    let allMembers: MemberRecord[] = [...mappedResidents, ...mappedFamilyMembers]

    // Apply search filter if provided
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase()
      allMembers = allMembers.filter(
        (m: MemberRecord) =>
          String(m.name || '')
            .toLowerCase()
            .includes(q) ||
          String(m.unitNumber || '')
            .toLowerCase()
            .includes(q) ||
          String(m.locationString || '')
            .toLowerCase()
            .includes(q) ||
          String(m.phone || '')
            .toLowerCase()
            .includes(q),
      )
    }

    // Group members flat-wise (by unitId)
    const flatMap: Record<
      string,
      {
        unitId: string
        unitNumber: string
        flatNumber: string
        locationString: string
        fullLocation: string
        primaryResident: { id?: string; fullName?: string; phone?: string } | null
        members: Record<string, unknown>[]
        guestCount: number
        guestAttendances: Record<string, unknown>[]
      }
    > = {}

    // Add guest attendances for target date
    const plainAttendances = attendances.map((a: FnbFoodAttendance): Record<string, unknown> => {
      const plain = (typeof a.get === 'function' ? a.get({ plain: true }) : a) as unknown as Record<string, unknown>
      let mKey = (plain.mealSlotKey || plain.meal_slot_key) as string | undefined
      if (!mKey || mKey === 'slot') {
        const globalMealSlot = plain.globalMealSlot as Record<string, unknown> | undefined
        const gName = ((globalMealSlot?.name as string) || '').toLowerCase()
        if (gName.includes('break') || gName.includes('fast')) mKey = 'breakfast'
        else if (gName.includes('lunch')) mKey = 'lunch'
        else if (gName.includes('snack') && !gName.includes('night') && !gName.includes('mid')) mKey = 'evening_snacks'
        else if (gName.includes('dinner')) mKey = 'dinner'
        else if (gName.includes('night') || gName.includes('mid')) mKey = 'midnight_snacks'
        else if (gName) mKey = gName.replace(/\s+/g, '_')
        else mKey = 'breakfast'
      }
      return {
        ...plain,
        mealSlotKey: mKey,
      }
    })

    const guestAttendances = plainAttendances.filter((a) => Boolean(a.isGuest || a.is_guest))

    allMembers.forEach((m: MemberRecord) => {
      const key = (m.unitId as string) || 'unassigned'
      if (!flatMap[key]) {
        flatMap[key] = {
          unitId: key,
          unitNumber: String(m.unitNumber || ''),
          flatNumber: String(m.unitNumber || ''),
          locationString: String(m.locationString || ''),
          fullLocation: String(m.locationString || ''),
          primaryResident: null,
          members: [],
          guestCount: 0,
          guestAttendances: [],
        }
      }
      if (m.memberType === 'resident' && !flatMap[key].primaryResident) {
        flatMap[key].primaryResident = {
          id: m.residentId as string,
          fullName: m.fullName as string,
          phone: m.phone as string,
        }
      }
      flatMap[key].members.push(m as unknown as Record<string, unknown>)
    })

    guestAttendances.forEach((ga: Record<string, unknown>) => {
      const key = (ga.unitId || ga.unit_id || 'unassigned') as string
      const formattedGa = {
        id: ga.id,
        locId: ga.locId || ga.loc_id,
        unitId: ga.unitId || ga.unit_id,
        date: ga.date,
        isGuest: true,
        guestName: ga.guestName || ga.guest_name || 'Guest',
        guestCount: Number(ga.guestCount || ga.guest_count) || 1,
        globalMealSlotId:
          ga.globalMealSlotId ||
          ga.global_meal_slot_id ||
          (ga.globalMealSlot as Record<string, unknown> | undefined)?.id ||
          null,
        globalMealSlot: ga.globalMealSlot || null,
        mealSlotKey: ga.mealSlotKey || 'breakfast',
        orderId: ga.orderId || ga.order_id,
        status: ga.status || 'attended',
        remarks: ga.remarks,
        createdAt: ga.createdAt || ga.created_at,
        creator: ga.creator,
      }

      if (flatMap[key]) {
        flatMap[key].guestAttendances.push(formattedGa as Record<string, unknown>)
        flatMap[key].guestCount = (flatMap[key].guestCount || 0) + (formattedGa.guestCount || 1)
      } else {
        flatMap[key] = {
          unitId: key,
          unitNumber: 'Guest Flat',
          flatNumber: 'Guest Flat',
          locationString: 'Guest Meals',
          fullLocation: 'Guest Meals',
          primaryResident: null,
          members: [],
          guestCount: formattedGa.guestCount || 1,
          guestAttendances: [formattedGa as Record<string, unknown>],
        }
      }
    })

    const flatsList = Object.values(flatMap)

    // Summary counts
    const totalResidingMembers = allMembers.length
    const totalPackageHolders = allMembers.filter((m: MemberRecord) => m.hasActivePackage).length
    const totalDinedInToday = attendances.filter((a: FnbFoodAttendance) => a.status === 'attended' && !a.isGuest).length
    const totalGuestDinedInToday = guestAttendances
      .filter((a) => a.status === 'attended')
      .reduce((sum: number, g) => sum + (Number(g.guestCount || g.guest_count) || 1), 0)

    res.status(200).json({
      success: true,
      message: 'Residing members & food attendance fetched successfully',
      data: {
        date: targetDate,
        summary: {
          totalResidingMembers,
          totalPackageHolders,
          attendedCount: totalDinedInToday,
          totalDinedInToday,
          totalGuestDinedInToday,
          pendingCount: Math.max(0, totalPackageHolders - totalDinedInToday),
        },
        members: allMembers,
        flats: flatsList,
        attendances,
      },
    })
  } catch (error) {
    console.error('Error fetching residing members & food attendances:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch food attendance data', error: String(error) })
  }
}

export const markAttendanceAndCreateOrder = async (req: Request, res: Response): Promise<void> => {
  const transaction = await sequelize.transaction()
  try {
    const {
      locId,
      date: dateInput,
      residentId: reqResidentId,
      familyMemberId: reqFamilyMemberId,
      memberId,
      memberType,
      unitId,
      mealSlotId: reqMealSlotId,
      meal_slot_id: reqMealSlotIdSnake,
      globalMealSlotId: reqGlobalMealSlotId,
      mealSlotKey: reqMealSlotKey,
      status: reqStatus,
      attended,
      remarks,
    } = req.body
    const loggedUserId = (req as AuthenticatedRequest).user?.id || null

    const mealSlotId = reqMealSlotId || reqMealSlotIdSnake || null

    let residentId = reqResidentId || null
    let familyMemberId = reqFamilyMemberId || null

    if (!residentId && !familyMemberId && memberId) {
      if (memberType === 'family' || memberType === 'family_member') {
        familyMemberId = memberId
      } else {
        residentId = memberId
      }
    }

    if (!residentId && !familyMemberId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Either residentId or familyMemberId is required' })
      return
    }

    // Resolve property mealSlot, mealSlotKey, and globalMealSlotId
    let resolvedSlotKey = reqMealSlotKey && reqMealSlotKey !== 'slot' ? String(reqMealSlotKey).toLowerCase() : ''
    let resolvedGlobalSlotId = reqGlobalMealSlotId || null
    let targetPSlot: FnbPropertyMealSlot | null = null

    // 1. Try finding FnbPropertyMealSlot by PK (if mealSlotId is a property meal slot ID)
    if (mealSlotId) {
      targetPSlot = await FnbPropertyMealSlot.findByPk(mealSlotId, {
        include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
        transaction,
      })
    }

    // 2. If not found by PK, search property meal slots for this locId by ID, globalMealSlotId, or slotKey/name
    if (!targetPSlot) {
      const rawKey =
        mealSlotId || reqGlobalMealSlotId || (reqMealSlotKey !== 'slot' ? reqMealSlotKey : '') || resolvedSlotKey || ''
      const searchKey = rawKey
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')

      if (searchKey) {
        const pSlots = await FnbPropertyMealSlot.findAll({
          where: { locId, isActive: true },
          include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
          transaction,
        })

        targetPSlot =
          pSlots.find((ps) => {
            const psIdClean = (ps.id || '').toLowerCase().replace(/[^a-z0-9]/g, '')
            const gSlotIdClean = (ps.globalMealSlotId || '').toLowerCase().replace(/[^a-z0-9]/g, '')
            const gNameClean = (ps.globalMealSlot?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
            const gSlotObj = ps.globalMealSlot as Record<string, unknown> | undefined
            const gCodeClean = (
              (gSlotObj?.code as string | undefined) ||
              (gSlotObj?.slotKey as string | undefined) ||
              ''
            )
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '')
            return (
              psIdClean === searchKey ||
              gSlotIdClean === searchKey ||
              (gCodeClean &&
                gCodeClean !== 'slot' &&
                (gCodeClean === searchKey || searchKey.includes(gCodeClean) || gCodeClean.includes(searchKey))) ||
              (gNameClean &&
                (gNameClean === searchKey || searchKey.includes(gNameClean) || gNameClean.includes(searchKey)))
            )
          }) || null
      }
    }

    if (!targetPSlot) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Invalid or unassigned meal slot for this property location.' })
      return
    }

    resolvedSlotKey = (targetPSlot.globalMealSlot?.name || '').toLowerCase().replace(/\s+/g, '_') || resolvedSlotKey
    resolvedGlobalSlotId = targetPSlot.globalMealSlotId || resolvedGlobalSlotId
    void resolvedGlobalSlotId

    const resolvedMealSlotId = targetPSlot.id
    if (!locId || !resolvedMealSlotId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'locId and valid mealSlotId are required' })
      return
    }

    const targetDate = typeof dateInput === 'string' && dateInput ? dateInput : new Date().toISOString().split('T')[0]!
    const slotKeyNormalized = resolvedSlotKey

    let attStatus: 'attended' | 'absent' | 'opted_out' = 'attended'
    if (reqStatus) {
      attStatus = reqStatus === 'absent' || reqStatus === 'opted_out' ? reqStatus : 'attended'
    } else if (typeof attended === 'boolean') {
      attStatus = attended ? 'attended' : 'absent'
    }

    // Prevent marking attendance if meal slot end time has crossed
    const todayStr = new Date().toISOString().split('T')[0]!
    if (attStatus === 'attended') {
      let isCrossed = false
      if (targetDate < todayStr) {
        isCrossed = true
      } else if (targetDate === todayStr) {
        let endTimeStr: string | null =
          (targetPSlot?.endTime as string) || (targetPSlot?.globalMealSlot?.endTime as string) || null
        let startTimeStr: string | null =
          (targetPSlot?.startTime as string) || (targetPSlot?.globalMealSlot?.startTime as string) || null

        if (!endTimeStr) {
          if (
            slotKeyNormalized.includes('mid') ||
            slotKeyNormalized.includes('night') ||
            slotKeyNormalized.includes('late')
          ) {
            endTimeStr = '23:59'
            startTimeStr = '23:30'
          } else if (slotKeyNormalized.includes('break') || slotKeyNormalized.includes('fast')) {
            endTimeStr = '09:30'
            startTimeStr = '07:30'
          } else if (slotKeyNormalized.includes('lunch')) {
            endTimeStr = '15:00'
            startTimeStr = '12:30'
          } else if (
            slotKeyNormalized.includes('snack') ||
            slotKeyNormalized.includes('even') ||
            slotKeyNormalized.includes('tea')
          ) {
            endTimeStr = '18:00'
            startTimeStr = '16:30'
          } else if (slotKeyNormalized.includes('dinner')) {
            endTimeStr = '22:00'
            startTimeStr = '19:30'
          } else {
            endTimeStr = '23:59'
            startTimeStr = '00:00'
          }
        }

        const startMin = parseTimeToMinutes(startTimeStr || '00:00', false)
        let endMin = parseTimeToMinutes(endTimeStr, true)
        if (endMin <= startMin && startMin > 0) {
          endMin += 1440
        }

        const now = new Date()
        const curMin = now.getHours() * 60 + now.getMinutes()
        if (curMin > endMin) {
          isCrossed = true
        }
      }

      if (isCrossed) {
        await transaction.rollback()
        res.status(400).json({
          success: false,
          message: 'Meal slot time has crossed. Attendance cannot be marked for this slot.',
        })
        return
      }
    }

    // 1. Verify active package contains meal slot
    const pkgWhere = residentId
      ? { residentId, status: FnbSubscriptionStatus.ACTIVE }
      : { familyMemberId, status: FnbSubscriptionStatus.ACTIVE }
    const activePkg = await FnbResidentPackage.findOne({
      where: pkgWhere,
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
      ],
      transaction,
    })

    if (activePkg) {
      const rawIncludedSlots: string[] = Array.isArray(activePkg.propertyPackage?.globalPackage?.includedMealSlots)
        ? activePkg.propertyPackage!.globalPackage!.includedMealSlots.map((s) => String(s).toLowerCase())
        : []

      if (rawIncludedSlots.length > 0) {
        const globalSlots = await FnbGlobalMealSlot.findAll({ transaction })
        const allowedKeysOrIds = new Set<string>(rawIncludedSlots)

        globalSlots.forEach((gs) => {
          if (allowedKeysOrIds.has(gs.id.toLowerCase())) {
            const nameClean = gs.name.toLowerCase().replace(/\s+/g, '')
            allowedKeysOrIds.add(nameClean)
            if (nameClean.includes('break') || nameClean.includes('fast')) allowedKeysOrIds.add('breakfast')
            if (nameClean.includes('lunch')) allowedKeysOrIds.add('lunch')
            if (nameClean.includes('mid') || nameClean.includes('night') || nameClean.includes('late')) {
              allowedKeysOrIds.add('midnight_snacks')
              allowedKeysOrIds.add('night_snacks')
            }
            if (nameClean.includes('snack') || nameClean.includes('even')) {
              allowedKeysOrIds.add('snacks')
              allowedKeysOrIds.add('evening_snacks')
            }
            if (nameClean.includes('dinner')) allowedKeysOrIds.add('dinner')
          }
        })

        if (!allowedKeysOrIds.has(slotKeyNormalized)) {
          console.warn(`Meal slot '${reqMealSlotKey}' check failed for included slots:`, Array.from(allowedKeysOrIds))
        }
      }
    }

    const attWhere = residentId
      ? { locId, date: targetDate, residentId, mealSlotId: resolvedMealSlotId }
      : { locId, date: targetDate, familyMemberId, mealSlotId: resolvedMealSlotId }

    let attendance = await FnbFoodAttendance.findOne({ where: attWhere, transaction })

    if (attStatus === 'absent' || attStatus === 'opted_out') {
      if (attendance) {
        await attendance.destroy({ transaction, force: true })
        attendance = null
      }
    } else {
      if (attendance) {
        await attendance.update(
          {
            status: 'attended',
            remarks: remarks || null,
            unitId: unitId || attendance.unitId,
            updatedBy: loggedUserId,
          },
          { transaction },
        )
      } else {
        attendance = await FnbFoodAttendance.create(
          {
            locId,
            unitId: unitId || null,
            date: targetDate,
            residentId: residentId || null,
            familyMemberId: familyMemberId || null,
            isGuest: false,
            guestCount: 1,
            mealSlotId: resolvedMealSlotId,
            status: 'attended',
            remarks: remarks || null,
            createdBy: loggedUserId,
            updatedBy: loggedUserId,
          },
          { transaction },
        )
      }
    }

    await transaction.commit()

    res.json({
      success: true,
      message:
        attStatus === 'attended' ? 'Food attendance marked successfully' : 'Food attendance removed successfully',
      data: {
        attendance,
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Error marking food attendance:', error)
    res.status(500).json({ success: false, message: 'Failed to mark attendance', error: String(error) })
  }
}

export const markGuestAttendance = async (req: Request, res: Response): Promise<void> => {
  const transaction = await sequelize.transaction()
  try {
    const {
      locId,
      unitId,
      date: dateInput,
      guestName,
      guestCount,
      globalMealSlotId,
      mealSlotKey,
      mealSlotId,
      remarks,
    } = req.body
    const loggedUserId = (req as AuthenticatedRequest).user?.id || null

    if (!locId || !unitId || (!mealSlotKey && !globalMealSlotId && !mealSlotId)) {
      await transaction.rollback()
      res.status(400).json({
        success: false,
        message: 'locId, unitId, and mealSlotKey, globalMealSlotId, or mealSlotId are required for guest attendance',
      })
      return
    }

    const targetDate = typeof dateInput === 'string' && dateInput ? dateInput : new Date().toISOString().split('T')[0]!
    const count = Number(guestCount || 1)

    // Resolve globalMealSlotId and mealSlotKey
    let resolvedGlobalSlotId: string | null = globalMealSlotId || null
    let slotKeyNormalized = String(mealSlotKey || '').toLowerCase()

    let gSlot = null
    if (resolvedGlobalSlotId) {
      gSlot = await FnbGlobalMealSlot.findByPk(resolvedGlobalSlotId, { transaction })
      if (!gSlot) {
        const pSlot = await FnbPropertyMealSlot.findByPk(resolvedGlobalSlotId, { transaction })
        if (pSlot) {
          resolvedGlobalSlotId = pSlot.globalMealSlotId || pSlot.id
          gSlot = await FnbGlobalMealSlot.findByPk(resolvedGlobalSlotId, { transaction })
        }
      }
    }

    if (!gSlot && (mealSlotKey || globalMealSlotId)) {
      const slotToMatch = String(mealSlotKey || globalMealSlotId)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      const globalSlots = await FnbGlobalMealSlot.findAll({ transaction })
      gSlot = globalSlots.find((gs) => {
        const nameClean = gs.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        const gsObj = gs as unknown as Record<string, unknown>
        const codeClean = ((gsObj.code as string | undefined) || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        return (
          gs.id === mealSlotKey ||
          gs.id === globalMealSlotId ||
          nameClean === slotToMatch ||
          slotToMatch.includes(nameClean) ||
          nameClean.includes(slotToMatch) ||
          (codeClean && codeClean !== 'slot' && codeClean === slotToMatch)
        )
      })
      if (gSlot) {
        resolvedGlobalSlotId = gSlot.id
      }
    }

    if (gSlot) {
      resolvedGlobalSlotId = gSlot.id
      const normName = gSlot.name.toLowerCase()
      if (normName.includes('break') || normName.includes('fast')) slotKeyNormalized = 'breakfast'
      else if (normName.includes('lunch')) slotKeyNormalized = 'lunch'
      else if (normName.includes('snack') && !normName.includes('night') && !normName.includes('mid'))
        slotKeyNormalized = 'evening_snacks'
      else if (normName.includes('dinner')) slotKeyNormalized = 'dinner'
      else if (normName.includes('night') || normName.includes('mid')) slotKeyNormalized = 'midnight_snacks'
      else slotKeyNormalized = normName.replace(/\s+/g, '_')
    } else if (!slotKeyNormalized || slotKeyNormalized === 'slot') {
      slotKeyNormalized = 'breakfast'
    }

    // Resolve property mealSlotId for guest attendance
    let resolvedGuestMealSlotId: string | null = mealSlotId || globalMealSlotId || null

    if (!resolvedGuestMealSlotId) {
      const slotToMatch = (mealSlotKey || globalMealSlotId || 'breakfast')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      const pSlots = await FnbPropertyMealSlot.findAll({
        where: { locId, isActive: true },
        include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
        transaction,
      })

      const matchedSlot = pSlots.find((ps) => {
        const gNameClean = (ps.globalMealSlot?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        const psGlobalSlot = ps.globalMealSlot as Record<string, unknown> | undefined
        const gCodeClean = (
          (psGlobalSlot?.code as string | undefined) ||
          (psGlobalSlot?.slotKey as string | undefined) ||
          ''
        )
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
        return (
          ps.id === mealSlotId ||
          ps.id === globalMealSlotId ||
          ps.globalMealSlotId === globalMealSlotId ||
          gCodeClean === slotToMatch ||
          gNameClean === slotToMatch
        )
      })

      resolvedGuestMealSlotId = matchedSlot ? matchedSlot.id : pSlots[0]?.id || null
    }

    if (!resolvedGuestMealSlotId) {
      const anySlot = await FnbPropertyMealSlot.findOne({ where: { locId }, transaction })
      if (anySlot) {
        resolvedGuestMealSlotId = anySlot.id
      }
    }

    if (!resolvedGuestMealSlotId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Valid property mealSlotId is required for guest attendance' })
      return
    }

    // Create FnbFoodAttendance entry for guest
    const guestAttendance = await FnbFoodAttendance.create(
      {
        locId,
        unitId,
        date: targetDate,
        isGuest: true,
        guestName: guestName || 'Guest Dine-In',
        guestCount: count,
        mealSlotId: resolvedGuestMealSlotId,
        status: 'attended',
        remarks: remarks || null,
        createdBy: loggedUserId,
        updatedBy: loggedUserId,
      },
      { transaction },
    )

    await transaction.commit()

    res.json({
      success: true,
      message: 'Guest attendance recorded successfully',
      data: {
        attendance: guestAttendance,
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Error recording guest attendance:', error)
    res.status(500).json({ success: false, message: 'Failed to record guest attendance', error: String(error) })
  }
}

// ─── Orders & Delivery Operations ────────────────────────────────────────────

export async function getResidentOrdersForProperty(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest
    const locId =
      (req.query.locId as string) ||
      (req.params.locId as string) ||
      authReq.locationId ||
      authReq.user?.defaultLocationId ||
      undefined
    const { date, orderStatus, orderType, search, assignedEmployeeId } = req.query

    const whereClause: Record<string, unknown> = {}
    if (locId) {
      whereClause.locId = locId
    }

    if (!locId && !assignedEmployeeId) {
      res.status(400).json({ success: false, message: 'locId or assignedEmployeeId is required' })
      return
    }

    if (date) {
      whereClause.date = String(date)
    }

    if (orderStatus) {
      whereClause.orderStatus = String(orderStatus)
    }

    if (orderType) {
      whereClause.orderType = String(orderType)
    }

    if (assignedEmployeeId) {
      whereClause.assignedEmployeeId = String(assignedEmployeeId)
    }

    const orders = await FnbResidentOrder.findAll({
      where: whereClause,
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
          include: [
            {
              model: PropertyUnit,
              as: 'unit',
              attributes: ['id', 'unit_number'],
              include: [
                {
                  model: PropertyFloor,
                  as: 'floor',
                  attributes: ['id', 'floor_number', 'floor_name'],
                  include: [
                    {
                      model: PropertyBlock,
                      as: 'block',
                      attributes: ['id', 'block_name'],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: ResidentFamilyMember,
          as: 'familyMember',
          attributes: ['id', 'firstName', 'lastName', 'relation', 'phone'],
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
              include: [
                {
                  model: PropertyUnit,
                  as: 'unit',
                  attributes: ['id', 'unit_number'],
                  include: [
                    {
                      model: PropertyFloor,
                      as: 'floor',
                      attributes: ['id', 'floor_number', 'floor_name'],
                      include: [
                        {
                          model: PropertyBlock,
                          as: 'block',
                          attributes: ['id', 'block_name'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: FnbPropertySpecialSlot,
          as: 'specialMealSlot',
          attributes: ['id', 'name', 'price'],
        },
        {
          model: FnbGlobalMealSlot,
          as: 'globalMealSlot',
          attributes: ['id', 'name', 'code'],
        },
        {
          model: FnbResidentOrderDetail,
          as: 'details',
          include: [
            { model: FnbDish, as: 'dish', attributes: ['id', 'name', 'category', 'basePrice', 'imageUrl'] },
            { model: FnbGlobalMealSlot, as: 'globalMealSlot', attributes: ['id', 'name', 'code'] },
            { model: FnbPropertySpecialSlot, as: 'specialMealSlot', attributes: ['id', 'name'] },
          ],
        },
        {
          model: User,
          as: 'assignedEmployee',
          attributes: ['id', 'username', 'email', 'phone'],
          include: [
            {
              model: UserDetail,
              as: 'profile',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'employeeCode', 'photoUrl'],
            },
          ],
        },
        {
          model: FnbFoodDelivery,
          as: 'delivery',
          include: [
            {
              model: User,
              as: 'employee',
              attributes: ['id', 'username', 'email', 'phone'],
            },
            {
              model: UserDetail,
              as: 'employeeDetail',
              attributes: ['id', 'userId', 'firstName', 'lastName', 'phone', 'employeeCode', 'photoUrl'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    let filteredOrders = orders
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase()
      filteredOrders = orders.filter((o: FnbResidentOrder) => {
        const residentObj = o.resident as Record<string, unknown> | undefined
        const familyMemberObj = o.familyMember as Record<string, unknown> | undefined
        const familyResObj = familyMemberObj?.resident as Record<string, unknown> | undefined
        const resUnitObj = residentObj?.unit as Record<string, unknown> | undefined
        const familyResUnitObj = familyResObj?.unit as Record<string, unknown> | undefined

        const resName = residentObj
          ? `${residentObj.firstName || ''} ${residentObj.lastName || ''}`.toLowerCase()
          : familyMemberObj
            ? `${familyMemberObj.firstName || ''} ${familyMemberObj.lastName || ''}`.toLowerCase()
            : ''
        const uNum = (
          (resUnitObj?.unit_number as string) ||
          (familyResUnitObj?.unit_number as string) ||
          ''
        ).toLowerCase()
        return resName.includes(q) || uNum.includes(q)
      })
    }

    res.status(200).json({ success: true, data: filteredOrders })
  } catch (error) {
    console.error('Error fetching resident orders:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch resident orders' })
  }
}

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  try {
    const orderId = String(req.params.id)
    const { orderStatus } = req.body

    const order = await FnbResidentOrder.findByPk(orderId)
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' })
      return
    }

    const nextStatus = String(orderStatus).toLowerCase()
    order.orderStatus = nextStatus

    const now = new Date()
    if (nextStatus === 'accepted' && !order.acceptedAt) {
      order.acceptedAt = now
    } else if (nextStatus === 'preparing' && !order.preparingStartedAt) {
      order.preparingStartedAt = now
    } else if (nextStatus === 'ready' && !order.readyAt) {
      order.readyAt = now
    } else if ((nextStatus === 'completed' || nextStatus === 'delivered') && !order.deliveredAt) {
      order.deliveredAt = now
    }

    order.updatedBy = (req as AuthenticatedRequest).user?.id || null
    await order.save()

    res.status(200).json({ success: true, data: order })
  } catch (error) {
    console.error('Error updating order status:', error)
    res.status(500).json({ success: false, message: 'Failed to update order status' })
  }
}

export async function completeRoomDelivery(req: Request, res: Response): Promise<void> {
  try {
    const orderId = String(req.params.id)
    let { photoUrl } = req.body
    const userId = (req as AuthenticatedRequest).user?.id || null

    if (photoUrl && photoUrl.startsWith('data:')) {
      photoUrl = await uploadBase64ToS3(photoUrl, 'fnb/deliveries')
    }

    const order = await FnbResidentOrder.findByPk(orderId)
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' })
      return
    }

    const now = new Date()
    order.orderStatus = 'completed'
    order.deliveredAt = now
    order.updatedBy = userId
    await order.save()

    let delivery = await FnbFoodDelivery.findOne({ where: { orderId: order.id } })
    if (delivery) {
      delivery.deliveryStatus = 'delivered'
      if (photoUrl) delivery.photoUrl = photoUrl
      delivery.deliveredAt = now
      delivery.updatedBy = userId
      await delivery.save()
    } else {
      delivery = await FnbFoodDelivery.create({
        locId: order.locId,
        orderId: order.id,
        employeeId: order.assignedEmployeeId || null,
        deliveryCharge: order.deliveryCharge || 0,
        deliveryStatus: 'delivered',
        photoUrl: photoUrl || null,
        deliveryDate: String(order.date),
        deliveredAt: now,
        createdBy: userId,
      })
    }

    res.status(200).json({
      success: true,
      message: 'Room delivery completed successfully',
      data: { order, delivery },
    })
  } catch (error) {
    console.error('Error completing room delivery:', error)
    res.status(500).json({ success: false, message: 'Failed to complete room delivery' })
  }
}

// ─── Assigned Deliveries ───────────────────────────────────────────────────────

/**
 * Get all assigned deliveries for food department employee
 */
export async function getAssignedDeliveries(req: Request, res: Response): Promise<void> {
  try {
    const locId = String(req.query.locId || req.params.locId || '')
    const employeeId = (req as Request & { user?: { id?: string } }).user?.id

    const whereClause: Record<string, unknown> = {}
    if (locId) {
      whereClause.locId = locId
    }
    if (employeeId) {
      whereClause.employeeId = employeeId
    }

    const deliveries = await FnbFoodDelivery.findAll({
      where: whereClause,
      include: [
        {
          model: FnbResidentOrder,
          as: 'order',
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
              include: [
                {
                  model: PropertyUnit,
                  as: 'unit',
                  attributes: ['id', 'unit_number'],
                  include: [
                    {
                      model: PropertyFloor,
                      as: 'floor',
                      attributes: ['id', 'floor_number', 'floor_name'],
                      include: [
                        {
                          model: PropertyBlock,
                          as: 'block',
                          attributes: ['id', 'block_name'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              model: FnbResidentOrderDetail,
              as: 'details',
              include: [
                { model: FnbDish, as: 'dish', attributes: ['id', 'name', 'category', 'imageUrl'] },
                { model: FnbGlobalMealSlot, as: 'globalMealSlot', attributes: ['id', 'name'] },
              ],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    res.status(200).json({
      success: true,
      data: deliveries,
    })
  } catch (error) {
    console.error('Error fetching employee assigned deliveries:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch assigned deliveries' })
  }
}

/**
 * Update delivery status (e.g. assigned -> delivering -> delivered)
 */
export async function updateDeliveryStatus(req: Request, res: Response): Promise<void> {
  try {
    const deliveryId = String(req.params.id)
    const { deliveryStatus, photoUrl } = req.body
    const userId = (req as Request & { user?: { id?: string } }).user?.id || null

    const delivery = await FnbFoodDelivery.findByPk(deliveryId)
    if (!delivery) {
      res.status(404).json({ success: false, message: 'Delivery record not found' })
      return
    }

    if (deliveryStatus) {
      delivery.deliveryStatus = deliveryStatus
    }
    if (photoUrl) {
      delivery.photoUrl = photoUrl
    }

    const now = new Date()
    if (deliveryStatus === 'delivered') {
      delivery.deliveredAt = now
    }

    delivery.updatedBy = userId
    await delivery.save()

    // Sync order status
    const order = await FnbResidentOrder.findByPk(delivery.orderId)
    if (order) {
      if (deliveryStatus === 'delivering') {
        order.orderStatus = 'delivering_to_room'
      } else if (deliveryStatus === 'delivered') {
        order.orderStatus = 'completed'
        order.deliveredAt = now
      }
      order.updatedBy = userId
      await order.save()
    }

    res.status(200).json({
      success: true,
      message: 'Delivery status updated successfully',
      data: { delivery, order },
    })
  } catch (error) {
    console.error('Error updating delivery status:', error)
    res.status(500).json({ success: false, message: 'Failed to update delivery status' })
  }
}

/**
 * Complete room delivery with proof photo URL
 */
export async function completeDeliveryWithProof(req: Request, res: Response): Promise<void> {
  try {
    const deliveryId = String(req.params.id)
    let { photoUrl } = req.body
    const userId = (req as Request & { user?: { id?: string } }).user?.id || null

    if (photoUrl && photoUrl.startsWith('data:')) {
      photoUrl = await uploadBase64ToS3(photoUrl, 'fnb/deliveries')
    }

    const delivery = await FnbFoodDelivery.findByPk(deliveryId)
    if (!delivery) {
      res.status(404).json({ success: false, message: 'Delivery record not found' })
      return
    }

    const now = new Date()
    delivery.deliveryStatus = 'delivered'
    if (photoUrl) {
      delivery.photoUrl = photoUrl
    }
    delivery.deliveredAt = now
    delivery.updatedBy = userId
    await delivery.save()

    const order = await FnbResidentOrder.findByPk(delivery.orderId)
    if (order) {
      order.orderStatus = 'completed'
      order.deliveredAt = now
      order.updatedBy = userId
      await order.save()
    }

    res.status(200).json({
      success: true,
      message: 'Room delivery completed with proof photo',
      data: { delivery, order },
    })
  } catch (error) {
    console.error('Error completing room delivery with proof:', error)
    res.status(500).json({ success: false, message: 'Failed to complete delivery proof' })
  }
}
