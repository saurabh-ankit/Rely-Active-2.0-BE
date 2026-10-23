import type { ServiceType } from '../../enums/billing.enum.js'
import type { Resident, ResidentFamilyMember } from '../../models/index.js'

/** Everything a source collector needs to know about the flat being billed. */
export interface UnitBillingContext {
  unitId: string
  unitNumber: string
  propertyId: string
  /** Every resident ever linked to the flat (moved-out residents still owe for their stay). */
  residents: Resident[]
  residentIds: string[]
  /** Family member id → resident id, so a family member's charges land on their resident's flat. */
  familyToResident: Map<string, string>
  familyMemberIds: string[]
  familyMembers: ResidentFamilyMember[]
  /**
   * First day this flat is billed from (null if no resident has a date). A resident who moved
   * here from another flat counts from the day after that flat's last invoice (or the move).
   */
  movedInDate: string | null
  /** Earliest original move-in of the residents: unbilled services are picked up from here. */
  usageFromDate: string | null
  /** Moves of this flat's residents, oldest first (to tell which flat a charge was used in). */
  moves: Map<string, { fromUnitId: string; moveDate: string }[]>
  /** Residents (and their family members) who moved from this flat to another: billed there now. */
  movedAwayResidentIds: Set<string>
  movedAwayFamilyMemberIds: Set<string>
  /** `${serviceType}:${sourceId}` → last day already billed on another flat (rent / packages). */
  billedElsewhere: Map<string, string>
  /** Flat numbers by id, for "From old flat …" labels. */
  unitNumbers: Map<string, string>
}

/** A billable line, as shown on the invoice screen and saved to services_invoice. */
export interface ServiceLine {
  /** Stable key the UI uses to select lines: `${serviceType}:${sourceId}[:period]`. */
  id: string
  serviceType: ServiceType
  /** Same as serviceType; Assist's screens read `type`. */
  type: ServiceType
  name: string
  description: string
  quantity: number
  price: number
  total: number
  residentId: string | null
  /** Set when a family member used the service (residentId is then their resident). */
  familyMemberId: string | null
  /** Who used it, for the invoice: the resident or a family member, by name. */
  consumerType: 'RESIDENT' | 'FAMILY_MEMBER' | null
  consumerName: string | null
  sourceId: string
  serviceStartDate: string
  serviceEndDate: string
  /** Display date (service date / period start). */
  date: string
  isAdjustment: boolean
  /** Old flat the charge was used in, when the resident has since moved here. */
  fromUnitId: string | null
  fromUnitNumber: string | null
}

/** A monthly charge active over a date range (rent, care package, food package). */
export interface RecurringItem {
  sourceId: string
  residentId: string | null
  familyMemberId?: string | null
  name: string
  monthlyPrice: number
  /** Inclusive active range; null bounds are open. */
  activeFrom: string | null
  activeTo: string | null
}

export interface RecurringSource {
  serviceType: ServiceType
  /** Whether a mid-period change is reconciled on the next MONTHLY invoice. */
  adjustable: boolean
  load(ctx: UnitBillingContext): Promise<RecurringItem[]>
}

export interface UsageSource {
  serviceType: ServiceType
  /** All charges with a service date in [from, to]. */
  load(ctx: UnitBillingContext, from: string, to: string): Promise<ServiceLine[]>
}

export const usageLine = (
  serviceType: ServiceType,
  fields: {
    sourceId: string
    residentId: string | null
    familyMemberId?: string | null
    name: string
    description: string
    quantity: number
    price: number
    total: number
    serviceDate: string
    /** Set when the source record belongs to another flat (e.g. a ticket on the old flat). */
    fromUnitId?: string | null
  },
): ServiceLine => ({
  id: `${serviceType}:${fields.sourceId}`,
  serviceType,
  type: serviceType,
  name: fields.name,
  description: fields.description,
  quantity: fields.quantity,
  price: fields.price,
  total: fields.total,
  residentId: fields.residentId,
  familyMemberId: fields.familyMemberId ?? null,
  consumerType: null,
  consumerName: null,
  sourceId: fields.sourceId,
  serviceStartDate: fields.serviceDate,
  serviceEndDate: fields.serviceDate,
  date: fields.serviceDate,
  isAdjustment: false,
  fromUnitId: fields.fromUnitId ?? null,
  fromUnitNumber: null,
})
