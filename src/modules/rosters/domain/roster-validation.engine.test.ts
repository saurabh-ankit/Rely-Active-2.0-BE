import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RosterValidationEngine } from './roster-validation.engine.js'
import {
  SchedulingResource,
  RosterDoctorLocation,
  RosterDoctorEngagement,
  RosterAssignmentDate,
  RosterSetting,
} from '../../../models/index.js'

vi.mock('../../../models/index.js', () => ({
  SchedulingResource: { findOne: vi.fn() },
  RosterDoctorProfile: { findOne: vi.fn() },
  RosterDoctorLocation: { findOne: vi.fn() },
  RosterDoctorEngagement: { findOne: vi.fn() },
  RosterAssignmentDate: { findAll: vi.fn() },
  RosterSetting: { findOne: vi.fn() },
}))

describe('RosterValidationEngine - Conflict Matrix Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. BLOCK when schedulable resource does not exist', async () => {
    vi.mocked(SchedulingResource.findOne).mockResolvedValueOnce(null)

    const res = await RosterValidationEngine.validate({
      companyId: 'comp-1',
      locationId: 'loc-1',
      schedulingResourceId: 'res-unknown',
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-05',
      proposedDates: [],
    })

    expect(res.valid).toBe(false)
    expect(res.errors[0]?.code).toBe('RESOURCE_NOT_FOUND')
  })

  it('2. BLOCK when schedulable resource status is INACTIVE', async () => {
    vi.mocked(SchedulingResource.findOne).mockResolvedValueOnce({
      id: 'res-inactive',
      status: 'INACTIVE',
      resourceType: 'EMPLOYEE',
    } as any)

    const res = await RosterValidationEngine.validate({
      companyId: 'comp-1',
      locationId: 'loc-1',
      schedulingResourceId: 'res-inactive',
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-05',
      proposedDates: [],
    })

    expect(res.valid).toBe(false)
    expect(res.errors[0]?.code).toBe('RESOURCE_INACTIVE')
  })

  it('3. BLOCK when doctor license is expired on specific instance date', async () => {
    vi.mocked(SchedulingResource.findOne).mockResolvedValueOnce({
      id: 'res-doc-1',
      status: 'ACTIVE',
      resourceType: 'DOCTOR',
      doctorProfile: {
        id: 'doc-prof-1',
        doctorType: 'IN_HOUSE',
        licenseExpiryDate: '2026-09-02',
      },
    } as any)

    vi.mocked(RosterDoctorLocation.findOne).mockResolvedValueOnce({ id: 'loc-access-1' } as any)
    vi.mocked(RosterSetting.findOne).mockResolvedValueOnce(null)
    vi.mocked(RosterAssignmentDate.findAll).mockResolvedValue([])

    const res = await RosterValidationEngine.validate({
      companyId: 'comp-1',
      locationId: 'loc-1',
      schedulingResourceId: 'res-doc-1',
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-05',
      proposedDates: [
        {
          assignmentDate: '2026-09-01',
          scheduledStart: new Date('2026-09-01T08:00:00Z'),
          scheduledEnd: new Date('2026-09-01T16:00:00Z'),
          slotTimeRange: '08:00 - 16:00',
        },
        {
          assignmentDate: '2026-09-03',
          scheduledStart: new Date('2026-09-03T08:00:00Z'),
          scheduledEnd: new Date('2026-09-03T16:00:00Z'),
          slotTimeRange: '08:00 - 16:00',
        },
      ],
    })

    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.code === 'LICENSE_EXPIRED_ON_DATE')).toBe(true)
  })

  it('4. BLOCK when Doctor is unauthorized for location', async () => {
    vi.mocked(SchedulingResource.findOne).mockResolvedValueOnce({
      id: 'res-doc-1',
      status: 'ACTIVE',
      resourceType: 'DOCTOR',
      doctorProfile: {
        id: 'doc-prof-1',
        doctorType: 'IN_HOUSE',
      },
    } as any)

    vi.mocked(RosterDoctorLocation.findOne).mockResolvedValueOnce(null)
    vi.mocked(RosterSetting.findOne).mockResolvedValueOnce(null)

    const res = await RosterValidationEngine.validate({
      companyId: 'comp-1',
      locationId: 'loc-unauth',
      schedulingResourceId: 'res-doc-1',
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-05',
      proposedDates: [],
    })

    expect(res.valid).toBe(false)
    expect(res.errors[0]?.code).toBe('LOCATION_UNAUTHORIZED')
  })

  it('5. BLOCK when Visiting Doctor has no active engagement', async () => {
    vi.mocked(SchedulingResource.findOne).mockResolvedValueOnce({
      id: 'res-visiting-doc',
      status: 'ACTIVE',
      resourceType: 'DOCTOR',
      doctorProfile: {
        id: 'doc-prof-visiting',
        doctorType: 'VISITING',
      },
    } as any)

    vi.mocked(RosterDoctorLocation.findOne).mockResolvedValueOnce({ id: 'loc-access-1' } as any)
    vi.mocked(RosterDoctorEngagement.findOne).mockResolvedValueOnce(null)
    vi.mocked(RosterSetting.findOne).mockResolvedValueOnce(null)

    const res = await RosterValidationEngine.validate({
      companyId: 'comp-1',
      locationId: 'loc-1',
      schedulingResourceId: 'res-visiting-doc',
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-05',
      proposedDates: [],
    })

    expect(res.valid).toBe(false)
    expect(res.errors[0]?.code).toBe('VISITING_ENGAGEMENT_INVALID')
  })

  it('6. BLOCK when exact or partial time overlap conflict exists', async () => {
    vi.mocked(SchedulingResource.findOne).mockResolvedValueOnce({
      id: 'res-emp-1',
      status: 'ACTIVE',
      resourceType: 'EMPLOYEE',
    } as any)

    vi.mocked(RosterSetting.findOne).mockResolvedValueOnce(null)
    vi.mocked(RosterAssignmentDate.findAll)
      .mockResolvedValueOnce([{ id: 'existing-inst-1' } as any]) // exact overlap
      .mockResolvedValue([])

    const res = await RosterValidationEngine.validate({
      companyId: 'comp-1',
      locationId: 'loc-1',
      schedulingResourceId: 'res-emp-1',
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-01',
      proposedDates: [
        {
          assignmentDate: '2026-09-01',
          scheduledStart: new Date('2026-09-01T08:00:00Z'),
          scheduledEnd: new Date('2026-09-01T16:00:00Z'),
          slotTimeRange: '08:00 - 16:00',
        },
      ],
    })

    expect(res.valid).toBe(false)
    expect(res.errors[0]?.code).toBe('TIME_OVERLAP_CONFLICT')
  })

  it('7. WARNING when rest period between consecutive shifts is under 11 hours', async () => {
    vi.mocked(SchedulingResource.findOne).mockResolvedValueOnce({
      id: 'res-emp-1',
      status: 'ACTIVE',
      resourceType: 'EMPLOYEE',
    } as any)

    vi.mocked(RosterSetting.findOne).mockResolvedValueOnce({ minRestPeriodHours: 11, maxWeeklyHours: 48, minMultiPropertyTravelMinutes: 60 } as any)
    vi.mocked(RosterAssignmentDate.findAll)
      .mockResolvedValueOnce([]) // no exact overlap
      .mockResolvedValueOnce([{ id: 'adjacent-shift-1' } as any]) // 8h rest violation
      .mockResolvedValue([])

    const res = await RosterValidationEngine.validate({
      companyId: 'comp-1',
      locationId: 'loc-1',
      schedulingResourceId: 'res-emp-1',
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-01',
      proposedDates: [
        {
          assignmentDate: '2026-09-01',
          scheduledStart: new Date('2026-09-01T08:00:00Z'),
          scheduledEnd: new Date('2026-09-01T16:00:00Z'),
          slotTimeRange: '08:00 - 16:00',
        },
      ],
    })

    expect(res.valid).toBe(true)
    expect(res.requiresOverride).toBe(true)
    expect(res.warnings[0]?.code).toBe('REST_PERIOD_VIOLATION')
  })

  it('8. PASS when assignment is valid with zero conflicts', async () => {
    vi.mocked(SchedulingResource.findOne).mockResolvedValueOnce({
      id: 'res-emp-1',
      status: 'ACTIVE',
      resourceType: 'EMPLOYEE',
    } as any)

    vi.mocked(RosterSetting.findOne).mockResolvedValueOnce(null)
    vi.mocked(RosterAssignmentDate.findAll).mockResolvedValue([])

    const res = await RosterValidationEngine.validate({
      companyId: 'comp-1',
      locationId: 'loc-1',
      schedulingResourceId: 'res-emp-1',
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-01',
      proposedDates: [
        {
          assignmentDate: '2026-09-01',
          scheduledStart: new Date('2026-09-01T08:00:00Z'),
          scheduledEnd: new Date('2026-09-01T16:00:00Z'),
          slotTimeRange: '08:00 - 16:00',
        },
      ],
    })

    expect(res.valid).toBe(true)
    expect(res.requiresOverride).toBe(false)
    expect(res.errors.length).toBe(0)
    expect(res.warnings.length).toBe(0)
  })
})
