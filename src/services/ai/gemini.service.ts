/**
 * gemini.service.ts
 * AI Engine for Rely Resident Voice Assistant & Ticket Categorization
 * Powered by Google Gemini (gemini-3.5-flash-lite)
 */

import { GoogleGenAI, type Part } from '@google/genai'
import { AiInteractionLog } from '../../models/index.js'

export interface VoiceAssistantFoodDetails {
  mealSlot?: string | null
  dishName?: string | null
  queryType?: 'menu_inquiry' | 'order_placement' | null
}

export interface VoiceAssistantIntentResult {
  intent: 'CREATE_TICKET' | 'CHECK_TICKET_STATUS' | 'FOOD_ORDER' | 'GREETING'
  isTicketStatusQuery: boolean
  foodRequest: boolean
  foodDetails?: VoiceAssistantFoodDetails | null
  areaType?: 'IN_FLAT' | 'COMMON_AREA' | null
  department?: string | null
  serviceType?: string | null
  category?: string | null
  subCategory?: string | null
  description: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null
  confidence: number
  needsClarification: boolean
}

export function isGreetingQueryText(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase().trim()
  const clean = lower.replace(/[!?.,]/g, '').trim()
  return (
    /^(hi|hello|hey|heyy|heya|hola|namaste|pranam|good\s*(morning|afternoon|evening|day))(\s+(rely|assistant|there|team|bot|ai))?$/i.test(
      clean,
    ) ||
    /^(hi|hello|hey|heyy|namaste)\b.*\b(how\s+are\s+you|kaise\s+ho|what\s+can\s+you\s+do|who\s+are\s+you)\b/i.test(
      clean,
    ) ||
    /^(how\s+are\s+you|who\s+are\s+you|what\s+can\s+you\s+do)$/i.test(clean)
  )
}

export function hasGreetingPrefix(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase().trim()
  return /^(hi|hello|hey|heyy|good\s*(morning|afternoon|evening)|namaste)\b/i.test(lower)
}

export function isTicketStatusQueryText(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase().trim()
  return (
    /\b(is|has)\s+my\s+(ticket|complaint)\s+(resolved|closed|done|fixed|completed)\b/i.test(lower) ||
    /\b(ticket|tickets|complaint|complaints)\b.*\b(status|resolved|resolve|closed|close|update|progress|check)\b/i.test(
      lower,
    ) ||
    /\b(status|resolved|resolve|closed|close|update|progress|check)\b.*\b(ticket|tickets|complaint|complaints)\b/i.test(
      lower,
    ) ||
    /\b(view|show|check|see)\s+(my\s+)?(last\s+5\s+)?tickets?\b/i.test(lower) ||
    /\b(mera|meri)\s+ticket\b/i.test(lower) ||
    /\bticket\s+(status|resolve|hua|kya)\b/i.test(lower)
  )
}

export function isFoodOrderQueryText(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase().trim()
  return (
    /\b(special\s*(menu|m[ae]nu|dish|dishes|meal|items?)|todays?\s*special|sepcal\s*(manu|menu)|special\s*kya\s*hai)\b/i.test(
      lower,
    ) ||
    /\b(menu|m[ae]nu|food\s*menu|today('?s)?\s*menu|what('?s)?\s*(the\s*)?(menu|m[ae]nu))\b/i.test(lower) ||
    /\b(whats?\s+(the\s+)?(menu|m[ae]nu)(\s+today)?)\b/i.test(lower) ||
    /\b((menu|m[ae]nu)\s+(in|for|of)\s+(the\s+)?(lunch|dinner|denner|breakfast|snacks|morning\s*snacks?|evening\s*snacks?|midnight\s*snacks?))\b/i.test(
      lower,
    ) ||
    /\b(what('?s)?\s+(the\s+)?((menu|m[ae]nu)\s+(in|for|of)\s+(the\s+)?)?(lunch|dinner|denner|breakfast|snacks|morning\s*snacks?|evening\s*snacks?|midnight\s*snacks?))\b/i.test(
      lower,
    ) ||
    /\b(what\s+is\s+(for\s+|in\s+(the\s+)?)?(breakfast|lunch|dinner|denner|snacks|food|today|morning\s*snacks?|evening\s*snacks?|midnight\s*snacks?))\b/i.test(
      lower,
    ) ||
    /\b(lunch|dinner|denner|breakfast|snacks|morning\s*snacks?|evening\s*snacks?|midnight\s*snacks?)\s+(menu|m[ae]nu|me\s+kya\s+hai|ka\s+menu)\b/i.test(
      lower,
    ) ||
    /\b(khane\s+me\s+kya\s+hai|aaj\s+ka\s+menu|khana\s+menu)\b/i.test(lower) ||
    /\b(order|get|buy|deliver|want|need|arrange|book)\s+(me\s+)?(some\s+)?(food|lunch|dinner|denner|breakfast|snack|snacks|meal|meals|biryani|pizza|burger|chai|tea|coffee|roti|sabzi|khana|room\s*service)\b/i.test(
      lower,
    ) ||
    /\b(food|lunch|dinner|denner|breakfast|snack|snacks|meal|meals|biryani|pizza|burger|chai|tea|coffee|room\s*service)\s+(order|chahiye|mangwana|mangwa do|bhejo|book)\b/i.test(
      lower,
    ) ||
    /\b(khana|bhojan)\s+(order|chahiye|mangwana|kya hai)\b/i.test(lower)
  )
}

export function extractFoodDetailsFromText(text: string, configuredMealSlots?: string[]): VoiceAssistantFoodDetails {
  if (!text) return { mealSlot: 'all', dishName: null, queryType: 'menu_inquiry' }
  const lower = text.toLowerCase().trim()

  let mealSlot: string | null = null
  let dishName: string | null = null

  // 1. Detect special menu / dishes inquiry
  if (
    /\b(special\s*(menu|m[ae]nu|dish|dishes|meal|items?)|todays?\s*special|sepcal\s*(manu|menu)|special\s*kya\s*hai)\b/i.test(
      lower,
    )
  ) {
    mealSlot = 'special'
  }

  // 2. Dynamic matching against configured meal slots if provided
  if (!mealSlot && configuredMealSlots && configuredMealSlots.length > 0) {
    const sortedSlots = [...configuredMealSlots].sort((a, b) => b.length - a.length)
    for (const slot of sortedSlots) {
      const cleanSlot = slot.trim()
      const escaped = cleanSlot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
        mealSlot = cleanSlot.toLowerCase()
        break
      }
    }
  }

  // 3. Fallback regex detection for standard slots
  if (!mealSlot) {
    if (/\b(morning\s*snacks?|morning\s*snack)\b/i.test(lower)) {
      mealSlot = 'morning snacks'
    } else if (/\b(evening\s*snacks?|evening\s*snack)\b/i.test(lower)) {
      mealSlot = 'evening snacks'
    } else if (/\b(mid\s*night\s*snacks?|midnight\s*snacks?)\b/i.test(lower)) {
      mealSlot = 'midnight snacks'
    } else if (/\b(lunch|duphar|dopahar)\b/i.test(lower)) {
      mealSlot = 'lunch'
    } else if (/\b(dinner|denner|dinnr|raat\s*ka\s*khana|night\s*meal)\b/i.test(lower)) {
      mealSlot = 'dinner'
    } else if (/\b(breakfast|break\s*fast|nashta|morning\s*meal)\b/i.test(lower)) {
      mealSlot = 'breakfast'
    } else if (/\b(snacks?|chai\s*nashta)\b/i.test(lower)) {
      mealSlot = 'snacks'
    }
  }

  // Detect specific dish name if mentioned
  if (/\bbiryani\b/i.test(lower)) dishName = 'biryani'
  else if (/\bpizza\b/i.test(lower)) dishName = 'pizza'
  else if (/\bdosa\b/i.test(lower)) dishName = 'dosa'
  else if (/\bidli\b/i.test(lower)) dishName = 'idli'
  else if (/\bnoodles?\b/i.test(lower)) dishName = 'noodles'

  // Detect query type
  const isOrder = /\b(order|book|buy|want|need|deliver|mangwa|mangwana|bhejo|lao)\b/i.test(lower)
  const queryType = isOrder ? 'order_placement' : 'menu_inquiry'

  return {
    mealSlot: mealSlot || 'all',
    dishName,
    queryType,
  }
}

export const departmentsData = [
  {
    code: 'RNM',
    name: 'Repair & Maintenance',
    description: 'Maintenance & engineering services',
  },
  {
    code: 'CON',
    name: 'Personal Assistant',
    description: 'Front desk & resident services',
  },
]

export interface GeminiResidentContext {
  name?: string
  flatNumber?: string
  openTicketsCount?: number
  residentId?: string | null
  familyMemberId?: string | null
  userId?: string | null
  configuredMealSlots?: string[]
}

/**
 * Main Gemini AI invocation
 * Powered exclusively by GEMINI_MODEL (gemini-3.5-flash-lite)
 */
export async function analyzeVoiceTranscriptWithGemini(
  queryOrTranscript: string,
  audioBase64?: { mimeType: string; data: string },
  residentContext?: GeminiResidentContext,
): Promise<VoiceAssistantIntentResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'

  const isGreetingCheck = isGreetingQueryText(queryOrTranscript)
  const isStatusCheck = !isGreetingCheck && isTicketStatusQueryText(queryOrTranscript)
  const isFoodCheck = !isGreetingCheck && !isStatusCheck && isFoodOrderQueryText(queryOrTranscript)

  const fallbackFood = isFoodCheck
    ? extractFoodDetailsFromText(queryOrTranscript, residentContext?.configuredMealSlots)
    : null
  const fallbackSlotText = fallbackFood?.mealSlot && fallbackFood.mealSlot !== 'all' ? `${fallbackFood.mealSlot} ` : ''

  const fallbackResult: VoiceAssistantIntentResult = isGreetingCheck
    ? {
        intent: 'GREETING',
        isTicketStatusQuery: false,
        foodRequest: false,
        areaType: null,
        department: null,
        serviceType: null,
        category: null,
        subCategory: null,
        description: 'Resident greeting',
        priority: null,
        confidence: 1.0,
        needsClarification: false,
      }
    : isStatusCheck
      ? {
          intent: 'CHECK_TICKET_STATUS',
          isTicketStatusQuery: true,
          foodRequest: false,
          areaType: null,
          department: null,
          serviceType: null,
          category: null,
          subCategory: null,
          description: queryOrTranscript || 'Check ticket status',
          priority: null,
          confidence: 1.0,
          needsClarification: false,
        }
      : isFoodCheck
        ? {
            intent: 'FOOD_ORDER',
            isTicketStatusQuery: false,
            foodRequest: true,
            foodDetails: fallbackFood,
            areaType: null,
            department: null,
            serviceType: null,
            category: null,
            subCategory: null,
            description: queryOrTranscript || `Inquiring about ${fallbackSlotText}food menu`,
            priority: null,
            confidence: 1.0,
            needsClarification: false,
          }
        : {
            intent: 'CREATE_TICKET',
            isTicketStatusQuery: false,
            foodRequest: false,
            areaType: 'IN_FLAT',
            department: 'Repair & Maintenance',
            serviceType: 'Rely Advantage Service',
            category: 'Electrical Maintenance',
            subCategory: null,
            description: queryOrTranscript || 'Service request',
            priority: 'MEDIUM',
            confidence: 1.0,
            needsClarification: false,
          }

  if (!apiKey) {
    console.warn('[GeminiService] No GEMINI_API_KEY found, using fallback.')
    return fallbackResult
  }

  const configuredSlotsText =
    residentContext?.configuredMealSlots && residentContext.configuredMealSlots.length > 0
      ? `\n   Configured Meal Slots for this property: ${residentContext.configuredMealSlots.join(', ')}`
      : ''

  const systemInstructions = `
You are the AI ticket classification engine for the **Rely Active resident mobile app**.

Classify the resident's voice/text request into the **exact hierarchy provided below**. Understand natural English, Indian English, Hinglish, Hindi-influenced English, and speech-to-text errors.

### 0. Priority Intent Checks (Greetings, Food & Ticket Status)

1. **Greetings & Pleasantries (GREETING)**:
   If the resident is saying "Hi", "Hello", "Hey", "Hi Rely", "Hello Assistant", "Hey there", "Good morning", "Good afternoon", "Good evening", "Namaste", "Hello kaise ho", "What can you do?", or any friendly greeting without reporting a maintenance issue or asking for ticket/food:
   - Set \`"intent": "GREETING"\`
   - Set \`"isTicketStatusQuery": false\`
   - Set \`"foodRequest": false\`
   - Set \`"department": null\`, \`"serviceType": null\`, \`"category": null\`, \`"subCategory": null\`, \`"priority": null\`, \`"areaType": null\`
   - Set \`"description"\` to "Resident greeting"
   - Set \`"needsClarification": false\`

2. **Ticket Status Check (CHECK_TICKET_STATUS)**:
   If the resident is asking to check status, progress, or resolution of their existing tickets or complaints (e.g., "Is my ticket resolved?", "Check my ticket status", "What is happening with my ticket?", "Has my complaint been solved?", "Mera ticket resolve hua kya?", "Show my tickets", "View my tickets", "Any update on my ticket?"):
   - Set \`"intent": "CHECK_TICKET_STATUS"\`
   - Set \`"isTicketStatusQuery": true\`
   - Set \`"foodRequest": false\`
   - Set \`"department": null\`, \`"serviceType": null\`, \`"category": null\`, \`"subCategory": null\`, \`"priority": null\`, \`"areaType": null\`
   - Set \`"description"\` to a clear summary (e.g. "Checking if ticket is resolved")
   - Set \`"needsClarification": false\`

3. **Food & Daily Menu Detection (foodRequest)**:${configuredSlotsText}
   If the resident's request is related to checking the daily food menu, asking what food is available today, asking for special menu or special dishes (e.g. "Whats special today", "What is the special menu today", "Whats a sepcal manu today", "Special dishes today", "Special meal", "Any special dish today?"), asking for a specific meal slot (e.g. lunch, dinner, morning snacks, evening snacks, breakfast, etc.), ordering, buying, requesting, booking meals, or room service (e.g. "Whats Menu today", "What's the menu in the lunch", "Whats the dinner menu today", "What is for dinner?", "What is for breakfast?", "What is for morning snacks", "I want to order food", "Can you get me some food?", "Please order pizza", "Mujhe khana order karna hai", "Biryani chahiye", "Lunch me kya hai", "Dinner me kya hai", "Khane me kya hai", "Aaj ka menu", "Book meal", "Room service"):
   - Set \`"foodRequest": true\`
   - Set \`"intent": "FOOD_ORDER"\`
   - Set \`"isTicketStatusQuery": false\`
   - Do NOT classify it as Personal Assistant or Repair & Maintenance.
   - Set \`"department": null\`, \`"serviceType": null\`, \`"category": null\`, \`"subCategory": null\`, \`"priority": null\`, \`"areaType": null\`
   - Set \`"foodDetails"\`:
     - \`"mealSlot"\`: string | null (Set to "special" if resident specifically asks for special menu, special dishes, or special meal! If resident asks for a configured meal slot, extract the meal slot name e.g. "lunch", "dinner", "morning snacks", "evening snacks", "breakfast", etc. If resident asks for today's overall menu or does not specify a single meal slot, set to "all" or null)
     - \`"dishName"\`: specific dish name mentioned (e.g. "biryani", "pizza", "dosa", etc.) or null
     - \`"queryType"\`: "menu_inquiry" | "order_placement"
   - Set \`"description"\` to a clear summary (e.g. "Inquiring about today's special menu", "Inquiring about today's lunch menu", "Ordering food")
   - Set \`"needsClarification": false\`

3. For all other requests to create/raise a ticket:
   - Set \`"intent": "CREATE_TICKET"\`
   - Set \`"isTicketStatusQuery": false\`
   - Set \`"foodRequest": false\`
   - Classify into the exact hierarchy below (Personal Assistant or Repair & Maintenance).

### Exact Hierarchy Mapping

1. **Department: "Personal Assistant"** (always areaType: "IN_FLAT")
   - **serviceType: "Assistance"**
     - **category: "Help with online services"**
       - **subCategory**: "Bank" | "Ticket Booking" | "Govt. Services" | "Passport Services" | "Legal Help" | "Post Office" | "Insurance" | "Municipal Service" | "Others"
     - **category: "Help to visit a place"**
       - **subCategory**: "Book Me A Cab" | "Go Out With A Personal Assistant" | "Others"
     - **category: "House Keeping"** (subCategory: null)
     - **category: "Laundry pickup"** (subCategory: null)

2. **Department: "Repair & Maintenance"**
   - **serviceType: "Rely Advantage Service"** (always areaType: "IN_FLAT" for in-flat issues)
     - **category**: "Electrical Maintenance" | "Plumbing Maintenance" | "Carpentry Maintenance" | "Miscellaneous Maintenance" (subCategory: null)
   - **serviceType: "Common Area Maintenance"** (always areaType: "COMMON_AREA" for shared community spaces: lift, clubhouse, pool, garden, corridor, lobby, parking)
     - **category**: "Electrical Maintenance" | "Plumbing Maintenance" | "Carpentry Maintenance" | "Miscellaneous Maintenance" (subCategory: null)

### Rules & Disambiguation
1. **Area Type**:
   - Must strictly be "IN_FLAT" or "COMMON_AREA".
   - All Personal Assistant requests are "IN_FLAT".
   - Rely Advantage Service requests inside flat/apartment/rooms/balcony are "IN_FLAT".
   - Common Area Maintenance requests in shared areas (clubhouse, lift, garden, pool, corridors, etc.) are "COMMON_AREA".
2. **Ambiguity & Needs Clarification**:
   - If the request is too vague, generic, or lacks details about what is specifically broken or needed (e.g. "Something is broken in my house", "I need some help", "There is an issue in my apartment", "Please send someone", "Maintenance required", "I have a problem"), you MUST set:
     \`"needsClarification": true\`
     and set confidence < 0.6.
   - For specific issues (e.g. "My bathroom tap is leaking", "Lift light is not working"), set \`"needsClarification": false\` and confidence >= 0.85.
3. **Hinglish & Speech Variations**:
   - "Mere bathroom ka tap leak ho raha hai", "paani leak" -> Plumbing Maintenance
   - "Mere room ka AC nahi chal raha", "Flat ka light kharab hai" -> Electrical Maintenance
   - "Mera cupboard ka door toot gaya hai" -> Carpentry Maintenance
   - "Mujhe laundry pickup chahiye" -> Laundry pickup
   - "Mere ghar ki cleaning karwani hai" -> House Keeping
   - "Mujhe cab book karna hai" -> Book Me A Cab
   - "Passport ke liye help chahiye" -> Passport Services
   - "Bank ka online kaam karwana hai" -> Bank
4. **Priority Determination**:
   - "LOW": minor inconveniences (e.g. "tap is dripping slowly", minor cosmetic issue)
   - "MEDIUM": default standard priority for normal repairs and requests (e.g. "AC not working", "fan making noise", "clean apartment")
   - "HIGH": severe disruptions or major water flooding (e.g. "water is flooding my bathroom")
   - "CRITICAL": dangerous emergencies or immediate hazards (e.g. "sparks coming from switch", "fire in electrical panel", "gas is leaking inside my flat")
5. **Never invent categories or service types outside the hierarchy.**

### Output — STRICT JSON ONLY (NO CODE BLOCK, NO EXTRA TEXT)

{
  "intent": "CREATE_TICKET | CHECK_TICKET_STATUS | FOOD_ORDER | GREETING",
  "isTicketStatusQuery": true | false,
  "foodRequest": true | false,
  "foodDetails": {
    "mealSlot": "string (e.g. lunch, dinner, morning snacks, evening snacks, etc.) | all | null",
    "dishName": "string | null",
    "queryType": "menu_inquiry | order_placement | null"
  },
  "areaType": "IN_FLAT | COMMON_AREA | null",
  "department": "Personal Assistant | Repair & Maintenance | null",
  "serviceType": "string | null",
  "category": "string | null",
  "subCategory": "string | null",
  "description": "short accurate description",
  "priority": "LOW | MEDIUM | HIGH | CRITICAL | null",
  "confidence": 0.00,
  "needsClarification": false
}
`

  const contextStr = residentContext
    ? `Resident Info: Name=${residentContext.name || 'Resident'}, Unit=${residentContext.flatNumber || 'Flat'}`
    : ''

  try {
    const ai = new GoogleGenAI({ apiKey })

    const contents: Part[] = []

    if (audioBase64?.data && audioBase64.mimeType) {
      contents.push({
        inlineData: {
          mimeType: audioBase64.mimeType,
          data: audioBase64.data,
        },
      })
    }

    const userPrompt = `${contextStr ? `${contextStr}\n` : ''}Resident Request: "${queryOrTranscript}"`
    contents.push({ text: userPrompt })

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemInstructions,
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    })

    const rawText = response.text
    const usage = response.usageMetadata
    const tokens = {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    }

    if (rawText) {
      const cleaned = rawText
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim()
      const parsed = JSON.parse(cleaned) as VoiceAssistantIntentResult

      const isGreetingQuery = parsed.intent === 'GREETING' || isGreetingCheck

      const isStatusQuery =
        !isGreetingQuery &&
        (parsed.intent === 'CHECK_TICKET_STATUS' || Boolean(parsed.isTicketStatusQuery) || isStatusCheck)

      const isFoodQuery =
        !isGreetingQuery &&
        !isStatusQuery &&
        (parsed.intent === 'FOOD_ORDER' || Boolean(parsed.foodRequest) || isFoodCheck)

      let finalResult: VoiceAssistantIntentResult

      if (isGreetingQuery) {
        finalResult = {
          intent: 'GREETING',
          isTicketStatusQuery: false,
          foodRequest: false,
          areaType: null,
          department: null,
          serviceType: null,
          category: null,
          subCategory: null,
          description: parsed.description || 'Resident greeting',
          priority: null,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 1.0,
          needsClarification: false,
        }
      } else if (isStatusQuery) {
        finalResult = {
          intent: 'CHECK_TICKET_STATUS',
          isTicketStatusQuery: true,
          foodRequest: false,
          areaType: null,
          department: null,
          serviceType: null,
          category: null,
          subCategory: null,
          description: parsed.description || queryOrTranscript,
          priority: null,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 1.0,
          needsClarification: false,
        }
      } else if (isFoodQuery) {
        const fallbackFoodDetails = extractFoodDetailsFromText(queryOrTranscript, residentContext?.configuredMealSlots)
        const parsedFood = parsed.foodDetails
        const mealSlot = parsedFood?.mealSlot || fallbackFoodDetails.mealSlot || 'all'
        const dishName = parsedFood?.dishName || fallbackFoodDetails.dishName || null
        const queryType = parsedFood?.queryType || fallbackFoodDetails.queryType || 'menu_inquiry'

        finalResult = {
          intent: 'FOOD_ORDER',
          isTicketStatusQuery: false,
          foodRequest: true,
          foodDetails: {
            mealSlot,
            dishName,
            queryType,
          },
          areaType: null,
          department: null,
          serviceType: null,
          category: null,
          subCategory: null,
          description:
            parsed.description ||
            (mealSlot && mealSlot !== 'all' ? `Inquiring about ${mealSlot} menu` : 'Food menu request'),
          priority: null,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 1.0,
          needsClarification: false,
        }
      } else {
        finalResult = {
          intent: 'CREATE_TICKET',
          isTicketStatusQuery: false,
          foodRequest: false,
          areaType: parsed.areaType || 'IN_FLAT',
          department: parsed.department || 'Repair & Maintenance',
          serviceType: parsed.serviceType ?? null,
          category: parsed.category ?? null,
          subCategory: parsed.subCategory ?? null,
          description: parsed.description || queryOrTranscript,
          priority: parsed.priority || 'MEDIUM',
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 1.0,
          needsClarification: Boolean(parsed.needsClarification),
        }
      }

      // Record interaction log in database
      try {
        await AiInteractionLog.create({
          residentId: residentContext?.residentId || null,
          familyMemberId: residentContext?.familyMemberId || null,
          model,
          status: 'SUCCESS',
          tokens,
          data: {
            input: {
              query: queryOrTranscript,
              hasAudio: Boolean(audioBase64?.data),
              audioMimeType: audioBase64?.mimeType || null,
              residentContext,
            },
            output: {
              rawText,
              result: finalResult,
            },
          },
          createdBy: residentContext?.userId || residentContext?.residentId || residentContext?.familyMemberId || null,
        })
      } catch (logErr) {
        console.error('[GeminiService] Failed to record AI interaction log:', logErr)
      }

      return finalResult
    }
  } catch (error) {
    console.error(`[GeminiService] Error calling model ${model}:`, error)

    // Record failure in database
    try {
      await AiInteractionLog.create({
        residentId: residentContext?.residentId || null,
        familyMemberId: residentContext?.familyMemberId || null,
        model,
        status: 'FAILED',
        tokens: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        data: {
          input: {
            query: queryOrTranscript,
            hasAudio: Boolean(audioBase64?.data),
            audioMimeType: audioBase64?.mimeType || null,
            residentContext,
          },
          error: error instanceof Error ? error.message : String(error),
          fallbackResult,
        },
        createdBy: residentContext?.userId || residentContext?.residentId || residentContext?.familyMemberId || null,
      })
    } catch (logErr) {
      console.error('[GeminiService] Failed to record AI interaction log:', logErr)
    }
  }

  return fallbackResult
}
