import type { Response } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  FnbDish,
  FnbGlobalMealSlot,
  FnbGlobalPackage,
  FnbMenuItem,
  FnbPropertyMealSlot,
  FnbPropertyPackage,
  FnbPropertySpecialSlot,
  FnbPropertySpecialSlotDish,
  FnbResidentPackage,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  Ticket,
} from '../../../models/index.js'
import { TicketStatus } from '../../../enums/ticket.enum.js'
import {
  analyzeVoiceTranscriptWithGemini,
  extractFoodDetailsFromText,
  isGreetingQueryText,
  hasGreetingPrefix,
} from '../../../services/ai/gemini.service.js'

interface FormattedSpecialDishItem {
  id: string
  dishId: string
  name: string
  description?: string
  dietaryType?: string
  imageUrl?: string | null
  price?: number
}

interface FormattedSpecialSlot {
  id: string
  name: string
  description?: string | null
  price: number
  dishes: FormattedSpecialDishItem[]
}

interface FormattedDishItem {
  id: string
  dishId: string
  menuItemId?: string | null
  mealSlot?: string
  mealSlotId?: string | null
  name: string
  description: string
  dietaryType: string
  calories: number
  imageUrl?: string | null
  price: number
  basePrice: number
  effectivePrice: number
  isPackageCovered: boolean
}

type PropertyMealSlotWithGlobal = FnbPropertyMealSlot & {
  globalMealSlot?: FnbGlobalMealSlot | null
  name?: string
}

interface ConfiguredSlotInfo {
  key: string
  name: string
  startTime?: string | null
  endTime?: string | null
  items: FormattedDishItem[]
}

/**
 * POST /api/v1/mobile/l1/assistant/process
 * Multimodal Voice Assistant endpoint. Accepts text transcript and/or recorded audio.
 */
export async function processVoiceAssistantQuery(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = req.user?.id
    let resident: Resident | null = null

    if (residentId) {
      resident = await Resident.findByPk(residentId, {
        include: [{ model: PropertyUnit, as: 'unit', required: false }],
      })
    }

    // 1. Extract query text from body or form data
    const bodyQuery = req.body?.query || req.body?.transcript || req.body?.text || ''

    // 2. Extract uploaded audio if present
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const audioFile = req.file || files?.audio?.[0] || files?.voice?.[0] || files?.voiceNote?.[0]

    let audioBase64: { mimeType: string; data: string } | undefined = undefined

    if (audioFile && audioFile.buffer) {
      audioBase64 = {
        mimeType: audioFile.mimetype || 'audio/mp4',
        data: audioFile.buffer.toString('base64'),
      }
    }

    const queryText = bodyQuery.trim()

    if (!queryText && !audioBase64) {
      res.status(400).json({
        success: false,
        message: 'Please provide either a voice recording or a text query',
      })
      return
    }

    // Gather resident context
    let openTicketsCount = 0
    if (resident) {
      openTicketsCount = await Ticket.count({
        where: {
          residentId: resident.id,
          status: { [Op.notIn]: [TicketStatus.CLOSED, TicketStatus.RESOLVED] },
        },
      })
    }

    const residentName = resident
      ? `${resident.firstName || ''} ${resident.lastName || ''}`.trim() || 'Resident'
      : 'Resident'
    const displayName = resident?.firstName
      ? resident.firstName.trim()
      : residentName !== 'Resident'
        ? residentName
        : ''
    const unitNumber = resident?.unit?.unit_number || 'Apartment'

    const effectiveResidentId = req.user?.residentId || (req.user?.roles?.includes('RESIDENT') ? req.user?.id : null)
    const effectiveFamilyMemberId =
      req.user?.familyMemberId || (req.user?.roles?.includes('RESIDENT_FAMILY_MEMBER') ? req.user?.id : null)

    // Resolve property location ID & configured meal slots dynamically
    let locId: string | null = null
    if (resident?.locId) {
      locId = resident.locId
    } else if (effectiveResidentId) {
      const resObj = await Resident.findByPk(effectiveResidentId)
      if (resObj?.locId) locId = resObj.locId
    }
    if (!locId && effectiveFamilyMemberId) {
      const fm = await ResidentFamilyMember.findByPk(effectiveFamilyMemberId)
      if (fm?.residentId) {
        const resObj = await Resident.findByPk(fm.residentId)
        if (resObj?.locId) locId = resObj.locId
      }
    }
    if (!locId) {
      locId = (req.user?.defaultLocationId as string) || null
    }
    if (!locId) {
      const firstSlot = await FnbPropertyMealSlot.findOne()
      locId = firstSlot?.locId || null
    }

    // Fetch configured property meal slots for this property
    const propertyMealSlots = await FnbPropertyMealSlot.findAll({
      where: locId ? { locId } : {},
      include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot' }],
    })

    const configuredSlotNames: string[] = Array.from(
      new Set(
        propertyMealSlots
          .map((ps) => {
            const plain = ps.get({ plain: true }) as PropertyMealSlotWithGlobal
            return plain.globalMealSlot?.name || plain.name
          })
          .filter(Boolean) as string[],
      ),
    )
    if (configuredSlotNames.length === 0) {
      const globalSlots = await FnbGlobalMealSlot.findAll({ where: { isActive: true }, order: [['startTime', 'ASC']] })
      globalSlots.forEach((gs) => {
        if (gs.name) configuredSlotNames.push(gs.name)
      })
    }

    // 3. Process via Gemini AI (with automated fallback and dynamic configured meal slots)
    const aiResult = await analyzeVoiceTranscriptWithGemini(queryText || 'Voice request', audioBase64, {
      name: residentName,
      flatNumber: unitNumber,
      openTicketsCount,
      residentId: effectiveResidentId,
      familyMemberId: effectiveFamilyMemberId,
      userId: req.user?.id || null,
      configuredMealSlots: configuredSlotNames,
    })

    const isGreetingQuery = aiResult.intent === 'GREETING' || isGreetingQueryText(queryText)
    const isStatusQuery =
      !isGreetingQuery && (aiResult.intent === 'CHECK_TICKET_STATUS' || Boolean(aiResult.isTicketStatusQuery))
    const isFoodQuery =
      !isGreetingQuery && !isStatusQuery && (aiResult.intent === 'FOOD_ORDER' || Boolean(aiResult.foodRequest))

    let latestTicket: Record<string, unknown> | null = null
    let ticketsList: Record<string, unknown>[] = []
    let textReply = ''

    let foodMenuData: Record<string, unknown> | null = null

    // Handle Greeting Query directly
    if (isGreetingQuery) {
      const currentHour = new Date().getHours()
      let salutation = 'Hello'
      if (currentHour >= 5 && currentHour < 12) {
        salutation = 'Good morning'
      } else if (currentHour >= 12 && currentHour < 17) {
        salutation = 'Good afternoon'
      } else if (currentHour >= 17 && currentHour < 22) {
        salutation = 'Good evening'
      }

      const lowerQ = queryText.toLowerCase().trim()
      if (lowerQ.includes('good morning')) salutation = 'Good morning'
      else if (lowerQ.includes('good afternoon')) salutation = 'Good afternoon'
      else if (lowerQ.includes('good evening')) salutation = 'Good evening'
      else if (lowerQ.startsWith('hi')) salutation = 'Hi'
      else if (lowerQ.startsWith('namaste')) salutation = 'Namaste'

      const greetingReply = displayName
        ? `${salutation} ${displayName}! How can I assist you today? You can ask me to raise a service ticket, check ticket status, or view today's dining menu.`
        : `${salutation}! How can I assist you today? You can ask me to raise a service ticket, check ticket status, or view today's dining menu.`

      res.status(200).json({
        success: true,
        message: 'Greeting processed successfully',
        data: {
          intent: 'GREETING',
          textReply: greetingReply,
          residentName: displayName || residentName,
        },
      })
      return
    }

    if (isStatusQuery) {
      const residentWhere: WhereOptions[] = []
      if (effectiveResidentId) {
        residentWhere.push({ residentId: effectiveResidentId })
      }
      if (effectiveFamilyMemberId) {
        residentWhere.push({ familyMemberId: effectiveFamilyMemberId })
      }

      if (residentWhere.length > 0) {
        const tickets = await Ticket.findAll({
          where: {
            [Op.or]: residentWhere,
          },
          order: [['createdAt', 'DESC']],
          limit: 5,
        })

        if (tickets.length > 0 && tickets[0]) {
          const t0 = tickets[0]
          const isResolved = t0.status === TicketStatus.RESOLVED || t0.status === TicketStatus.CLOSED
          latestTicket = {
            id: t0.id,
            ticketNumber: t0.ticketNumber,
            title: t0.title,
            category: t0.category,
            status: t0.status,
            priority: t0.priority,
            tatOption: t0.tatOption || '1-2 hour',
            description: t0.description,
            createdAt: t0.createdAt,
          }

          ticketsList = tickets.map((t) => ({
            id: t.id,
            ticketNumber: t.ticketNumber,
            title: t.title,
            category: t.category,
            status: t.status,
            priority: t.priority,
            tatOption: t.tatOption || '1-2 hour',
            description: t.description,
            createdAt: t.createdAt,
          }))

          const greetingPrefix = hasGreetingPrefix(queryText) && displayName ? `Hello ${displayName}! ` : ''
          if (isResolved) {
            textReply = `${greetingPrefix}Yes, your latest ticket #${t0.ticketNumber} ("${t0.title}") has been marked as ${t0.status}.`
          } else {
            textReply = `${greetingPrefix}Your latest ticket #${t0.ticketNumber} ("${t0.title}") is currently ${t0.status} (expected TAT: ${t0.tatOption || '1-2 hour'}). It has not been resolved yet.`
          }
        } else {
          textReply = displayName
            ? `Hello ${displayName}! You don't have any registered service tickets at the moment. Would you like me to help you raise one?`
            : "You don't have any registered service tickets at the moment. Would you like me to help you raise one?"
        }
      } else {
        textReply = displayName
          ? `Hello ${displayName}! You don't have any registered service tickets at the moment.`
          : "You don't have any registered service tickets at the moment."
      }
    } else if (isFoodQuery) {
      // 2. Determine target slot from AI result or query text
      const aiFoodDetails = aiResult.foodDetails
      const fallbackFood = extractFoodDetailsFromText(queryText, configuredSlotNames)
      const targetMealSlot = (
        aiFoodDetails?.mealSlot && aiFoodDetails.mealSlot !== 'all'
          ? aiFoodDetails.mealSlot
          : fallbackFood.mealSlot && fallbackFood.mealSlot !== 'all'
            ? fallbackFood.mealSlot
            : null
      ) as string | null

      // 3. Determine current date and day of week
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const targetDayOfWeek = days[today.getDay()] || 'friday'

      // 4. Fetch menu items scheduled for this location & day
      const whereCondition: WhereOptions & { locId?: string } = {
        [Op.or]: [{ date: todayStr }, { dayOfWeek: targetDayOfWeek }, { dayOfWeek: targetDayOfWeek?.toUpperCase() }],
      }
      if (locId) {
        whereCondition.locId = locId
      }

      const menuItems = await FnbMenuItem.findAll({
        where: whereCondition,
        include: [{ model: FnbDish, as: 'dish' }],
      })

      // Fetch special menus if any
      const specialSlots = await FnbPropertySpecialSlot.findAll({
        where: { ...(locId ? { locId } : {}), isActive: true },
        include: [
          {
            model: FnbPropertySpecialSlotDish,
            as: 'specialDishes',
            include: [{ model: FnbDish, as: 'dish' }],
          },
        ],
      })

      const formattedSpecial: FormattedSpecialSlot[] = specialSlots.map((s) => {
        const plain = s.get({ plain: true }) as FnbPropertySpecialSlot & {
          specialDishes?: Array<{
            id: string
            dishId: string
            price?: number
            dish?: FnbDish
          }>
        }
        return {
          id: plain.id,
          name: plain.name,
          description: plain.description,
          price: Number(plain.price || 0),
          dishes: (plain.specialDishes || []).map((sd) => ({
            id: sd.id,
            dishId: sd.dishId,
            name: sd.dish?.name || 'Special Dish',
            description: sd.dish?.description || '',
            dietaryType: sd.dish?.dietaryType || 'Veg',
            imageUrl: sd.dish?.imageUrl || null,
            price: Number(sd.price || 0),
          })),
        }
      })

      // Check active package
      let activePkg: Record<string, unknown> | null = null
      let includedSlotsList: string[] = []
      if (effectiveResidentId || effectiveFamilyMemberId) {
        const foundPkg = await FnbResidentPackage.findOne({
          where: {
            [Op.or]: [
              ...(effectiveResidentId ? [{ residentId: effectiveResidentId }] : []),
              ...(effectiveFamilyMemberId ? [{ familyMemberId: effectiveFamilyMemberId }] : []),
            ],
            status: ['active', 'ACTIVE'],
          },
          include: [
            {
              model: FnbPropertyPackage,
              as: 'propertyPackage',
              include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
            },
          ],
        })
        if (foundPkg) {
          const rawSlots = (foundPkg.propertyPackage?.globalPackage?.includedMealSlots as string[]) || []
          includedSlotsList = rawSlots.map((s) =>
            String(s)
              .toLowerCase()
              .replace(/[^a-z0-9]/g, ''),
          )
          activePkg = {
            id: foundPkg.id,
            name: foundPkg.propertyPackage?.globalPackage?.name || 'Active Package',
            status: foundPkg.status,
            includedMealSlots: rawSlots,
          }
        }
      }

      // 5. Fetch all active dishes for reference
      const allActiveDishes = await FnbDish.findAll({
        where: { isActive: true },
        order: [['name', 'ASC']],
      })

      const formattedAllDishes: FormattedDishItem[] = []
      const seenDishIds = new Set<string>()

      allActiveDishes.forEach((d) => {
        const plainDish = d.get({ plain: true }) as FnbDish & {
          nutritionalInfo?: { calories?: number }
        }
        const price = Number(plainDish.basePrice || 0)

        const formatted: FormattedDishItem = {
          id: plainDish.id,
          dishId: plainDish.id,
          menuItemId: null,
          name: plainDish.name || 'Dish Item',
          description: plainDish.description || '',
          dietaryType: plainDish.dietaryType || 'Veg',
          calories: plainDish.nutritionalInfo?.calories || 250,
          imageUrl: plainDish.imageUrl || null,
          price,
          basePrice: price,
          effectivePrice: price,
          isPackageCovered: false,
        }

        seenDishIds.add(plainDish.id)
        formattedAllDishes.push(formatted)
      })

      // 6. Group scheduled dishes dynamically into configured meal slots
      const slotIdToNameMap = new Map<string, string>()
      propertyMealSlots.forEach((ps) => {
        const plain = ps.get({ plain: true }) as PropertyMealSlotWithGlobal
        const slotName = plain.globalMealSlot?.name || plain.name
        if (plain.id && slotName) slotIdToNameMap.set(plain.id, slotName)
      })

      const groupedSlots: Record<string, FormattedDishItem[]> = {}
      const dishNamesList: string[] = []

      menuItems.forEach((item) => {
        const plain = item.get({ plain: true }) as FnbMenuItem & {
          dish?: FnbDish & { nutritionalInfo?: { calories?: number } }
        }
        const dishObj = plain.dish
        const rawSlot = String(
          plain.mealSlot || (plain.mealSlotId ? slotIdToNameMap.get(plain.mealSlotId) : null) || 'General',
        ).trim()
        const lowerSlot = rawSlot.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const price = Number(dishObj?.basePrice || 0)

        const isCovered =
          includedSlotsList.length > 0 && includedSlotsList.some((s) => s === lowerSlot.replace(/[^a-z0-9]/g, ''))

        const formattedItem: FormattedDishItem = {
          id: plain.id,
          menuItemId: plain.id,
          dishId: dishObj?.id || plain.dishId,
          mealSlot: rawSlot,
          mealSlotId: plain.mealSlotId ?? null,
          name: dishObj?.name || 'Dish Item',
          description: dishObj?.description || '',
          dietaryType: dishObj?.dietaryType || 'Veg',
          calories: dishObj?.nutritionalInfo?.calories || 250,
          imageUrl: dishObj?.imageUrl || null,
          price,
          basePrice: price,
          effectivePrice: isCovered ? 0 : price,
          isPackageCovered: isCovered,
        }

        if (!groupedSlots[lowerSlot]) groupedSlots[lowerSlot] = []
        groupedSlots[lowerSlot].push(formattedItem)

        if (dishObj?.name && !dishNamesList.includes(dishObj.name)) {
          dishNamesList.push(dishObj.name)
        }

        if (dishObj?.id && !seenDishIds.has(dishObj.id)) {
          seenDishIds.add(dishObj.id)
          formattedAllDishes.push(formattedItem)
        }
      })

      const slotMap = new Map<string, ConfiguredSlotInfo>()

      propertyMealSlots.forEach((ps) => {
        const plain = ps.get({ plain: true }) as PropertyMealSlotWithGlobal
        const slotName = plain.globalMealSlot?.name || plain.name || 'Slot'
        const slotKey = slotName.toLowerCase().replace(/[^a-z0-9]/g, '_')
        if (!slotMap.has(slotKey)) {
          slotMap.set(slotKey, {
            key: slotKey,
            name: slotName,
            startTime: plain.startTime,
            endTime: plain.endTime,
            items: groupedSlots[slotKey] || [],
          })
        }
      })

      // Also ensure any slots present in groupedSlots are in slotMap
      for (const [key, items] of Object.entries(groupedSlots)) {
        if (!slotMap.has(key)) {
          const firstItem = items[0]
          const slotName =
            firstItem?.mealSlot ||
            key
              .split('_')
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ')
          slotMap.set(key, {
            key,
            name: slotName,
            items,
          })
        } else {
          slotMap.get(key)!.items = items
        }
      }

      const parseSlotTime = (tStr?: string | null) => {
        if (!tStr) return 9999
        const startPart = tStr.split('-')[0]?.trim()
        if (!startPart) return 9999
        const parts = startPart.split(':')
        const h = parts[0] !== undefined ? Number(parts[0]) : NaN
        const m = parts[1] !== undefined ? Number(parts[1]) : 0
        return isNaN(h) || isNaN(m) ? 9999 : h * 60 + m
      }

      const orderedConfiguredSlots = Array.from(slotMap.values()).sort(
        (a, b) => parseSlotTime(a.startTime) - parseSlotTime(b.startTime),
      )

      const rawUserText = String(queryText || '').toLowerCase()
      const isSpecialRequest =
        targetMealSlot === 'special' ||
        targetMealSlot?.toLowerCase().includes('special') ||
        targetMealSlot?.toLowerCase().includes('sepcal') ||
        /\b(special\s*(menu|m[ae]nu|dish|dishes|meal|items?)|todays?\s*special|sepcal\s*(manu|menu)|special\s*kya\s*hai)\b/i.test(
          rawUserText,
        )

      let matchedSlot: ConfiguredSlotInfo | null = null
      if (!isSpecialRequest && targetMealSlot) {
        const normTarget = targetMealSlot.toLowerCase().replace(/[^a-z0-9]/g, '')
        // 1. Exact match
        matchedSlot =
          orderedConfiguredSlots.find(
            (s) =>
              s.key.replace(/[^a-z0-9]/g, '') === normTarget ||
              s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normTarget,
          ) || null

        // 2. Substring match
        if (!matchedSlot) {
          matchedSlot =
            orderedConfiguredSlots.find((s) => {
              const sKeyNorm = s.key.replace(/[^a-z0-9]/g, '')
              const sNameNorm = s.name.toLowerCase().replace(/[^a-z0-9]/g, '')
              return (
                normTarget.includes(sKeyNorm) ||
                sKeyNorm.includes(normTarget) ||
                normTarget.includes(sNameNorm) ||
                sNameNorm.includes(normTarget)
              )
            }) || null
        }

        // 3. Fallback aliases
        if (!matchedSlot) {
          if (normTarget.includes('break') || normTarget.includes('nashta')) {
            matchedSlot =
              orderedConfiguredSlots.find(
                (s) =>
                  s.key.includes('morn') ||
                  s.key.includes('break') ||
                  s.name.toLowerCase().includes('morn') ||
                  s.name.toLowerCase().includes('break'),
              ) || null
          } else if (normTarget.includes('snack')) {
            matchedSlot =
              orderedConfiguredSlots.find(
                (s) =>
                  s.key.includes('even') ||
                  s.key.includes('snack') ||
                  s.name.toLowerCase().includes('even') ||
                  s.name.toLowerCase().includes('snack'),
              ) || null
          }
        }
      }

      // If a specific meal slot is requested and matched, only return that meal slot in menu
      let menuToSend = groupedSlots
      if (matchedSlot && matchedSlot.items.length > 0) {
        menuToSend = { [matchedSlot.key]: matchedSlot.items }
      }

      foodMenuData = {
        date: todayStr,
        dayOfWeek: targetDayOfWeek,
        locationId: locId,
        targetMealSlot: isSpecialRequest ? 'special' : matchedSlot ? matchedSlot.key : targetMealSlot || null,
        hasActivePackage: Boolean(activePkg),
        activePackage: activePkg,
        menu: menuToSend,
        propertyMealSlots: propertyMealSlots.map((ps) => {
          const plain = ps.get({ plain: true }) as PropertyMealSlotWithGlobal
          return {
            id: plain.id,
            name: plain.globalMealSlot?.name || plain.name || 'Slot',
            startTime: plain.startTime,
            endTime: plain.endTime,
          }
        }),
        specialMenu: formattedSpecial,
        allDishes: formattedAllDishes,
      }

      // 7. Generate intelligent speech response dynamically based on meal slot or special inquiry
      if (isSpecialRequest) {
        if (formattedSpecial.length > 0) {
          const specialSummaries = formattedSpecial.map((s) => {
            const dishNames = (s.dishes || []).map((d) => d.name).filter(Boolean)
            if (dishNames.length > 0) {
              return `${s.name} (${dishNames.join(', ')})`
            }
            return s.name
          })
          textReply = `Today's special menu features: ${specialSummaries.join('; ')}. Here are the special dishes for today.`
        } else {
          textReply = 'There are no special dishes scheduled for today. Here is the dining menu.'
        }
      } else if (matchedSlot) {
        const uniqueDishes = Array.from(new Set(matchedSlot.items.map((d) => d.name).filter(Boolean)))
        const slotDisplay = matchedSlot.name
        const isNight = matchedSlot.key.includes('dinner') || matchedSlot.name.toLowerCase().includes('dinner')
        const prefix = isNight ? "Tonight's" : "Today's"

        if (uniqueDishes.length > 0) {
          textReply = `${prefix} ${slotDisplay.toLowerCase()} menu features: ${uniqueDishes.join(', ')}. Here is the complete ${slotDisplay.toLowerCase()} menu.`
        } else {
          textReply = `No dishes are currently configured for ${slotDisplay.toLowerCase()} today. Here is the dining menu.`
        }
      } else {
        // Dynamic summary of all configured slots that have dishes
        const slotSummaries = orderedConfiguredSlots
          .filter((slot) => slot.items.length > 0)
          .map((slot) => {
            const uniqueNames = Array.from(new Set(slot.items.map((d) => d.name).filter(Boolean)))
            return `${slot.name} (${uniqueNames.join(', ')})`
          })

        if (slotSummaries.length > 0) {
          textReply = `Today's menu features: ${slotSummaries.join(', ')}. Here is the complete menu for today.`
        } else {
          const allActive = formattedAllDishes.map((d) => d.name).filter(Boolean)
          const uniqueAll = Array.from(new Set(allActive))
          if (uniqueAll.length > 0) {
            textReply = `Today's menu features: ${uniqueAll.slice(0, 10).join(', ')}. Here is the complete menu for today.`
          } else {
            textReply = "Here is today's dining menu."
          }
        }
      }
    }

    // 4. Return classification result
    if (isFoodQuery) {
      if (hasGreetingPrefix(queryText) && displayName && textReply) {
        textReply = `Hello ${displayName}! ${textReply}`
      }
      res.status(200).json({
        success: true,
        message: 'Food menu retrieved successfully',
        data: {
          intent: 'FOOD_ORDER',
          foodRequest: true,
          textReply: textReply || null,
          foodMenuData,
        },
      })
      return
    }

    if (isStatusQuery) {
      res.status(200).json({
        success: true,
        message: 'Ticket status retrieved successfully',
        data: {
          intent: 'CHECK_TICKET_STATUS',
          isTicketStatusQuery: true,
          foodRequest: false,
          textReply: textReply || null,
          latestTicket,
          ticketsList,
        },
      })
      return
    }

    const greetingPrefix = hasGreetingPrefix(queryText) && displayName ? `Hello ${displayName}! ` : ''
    const dept = aiResult.department || 'Repair & Maintenance'
    const cat = aiResult.category || 'Electrical'
    const defaultSpokenReply = `${greetingPrefix}I've categorized your request under ${dept} - ${cat}. Please review and confirm your ticket.`

    res.status(200).json({
      success: true,
      message: 'Voice assistant processed successfully',
      data: {
        intent: aiResult.intent || 'CREATE_TICKET',
        isTicketStatusQuery: false,
        foodRequest: false,
        textReply: textReply || defaultSpokenReply,
        areaType: aiResult.areaType || 'IN_FLAT',
        department: aiResult.department,
        serviceType: aiResult.serviceType ?? null,
        category: aiResult.category,
        subCategory: aiResult.subCategory ?? null,
        description: aiResult.description || queryText,
        priority: aiResult.priority || 'MEDIUM',
        confidence: aiResult.confidence ?? 1.0,
        needsClarification: aiResult.needsClarification ?? false,
      },
    })
  } catch (err) {
    console.error('Error in voice assistant query:', err)
    res.status(500).json({
      success: false,
      message: 'Failed to process voice assistant query',
      error: (err as Error)?.message,
    })
  }
}

/**
 * POST /api/v1/mobile/l1/tickets/categorize
 * Dedicated category matching endpoint for ticket creation.
 */
export async function categorizeTicketWithAI(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const text = (req.body?.text || req.body?.description || req.body?.query || '').trim()

    if (!text) {
      res.status(400).json({ success: false, message: 'Text or description is required for categorization' })
      return
    }

    const effectiveResidentId = req.user?.residentId || (req.user?.roles?.includes('RESIDENT') ? req.user?.id : null)
    const effectiveFamilyMemberId =
      req.user?.familyMemberId || (req.user?.roles?.includes('RESIDENT_FAMILY_MEMBER') ? req.user?.id : null)

    const aiResult = await analyzeVoiceTranscriptWithGemini(text, undefined, {
      residentId: effectiveResidentId,
      familyMemberId: effectiveFamilyMemberId,
      userId: req.user?.id || null,
    })

    const isStatusQuery = aiResult.intent === 'CHECK_TICKET_STATUS' || Boolean(aiResult.isTicketStatusQuery)
    const isFoodQuery = aiResult.intent === 'FOOD_ORDER' || Boolean(aiResult.foodRequest)

    res.status(200).json({
      success: true,
      message: isStatusQuery
        ? 'Ticket status identified'
        : isFoodQuery
          ? 'Food request identified'
          : 'Category identified successfully',
      data: {
        intent:
          aiResult.intent || (isStatusQuery ? 'CHECK_TICKET_STATUS' : isFoodQuery ? 'FOOD_ORDER' : 'CREATE_TICKET'),
        isTicketStatusQuery: isStatusQuery,
        foodRequest: isFoodQuery,
        foodDetails: isFoodQuery ? aiResult.foodDetails || null : null,
        areaType: isStatusQuery || isFoodQuery ? null : aiResult.areaType || 'IN_FLAT',
        department: isStatusQuery || isFoodQuery ? null : aiResult.department,
        serviceType: isStatusQuery || isFoodQuery ? null : (aiResult.serviceType ?? null),
        category: isStatusQuery || isFoodQuery ? null : aiResult.category,
        subCategory: isStatusQuery || isFoodQuery ? null : (aiResult.subCategory ?? null),
        description: aiResult.description || text,
        priority: isStatusQuery || isFoodQuery ? null : aiResult.priority || 'MEDIUM',
        confidence: aiResult.confidence ?? 1.0,
        needsClarification: aiResult.needsClarification ?? false,
      },
    })
  } catch (err) {
    console.error('Error categorizing ticket:', err)
    res.status(500).json({
      success: false,
      message: 'Failed to categorize ticket',
      error: (err as Error)?.message,
    })
  }
}
