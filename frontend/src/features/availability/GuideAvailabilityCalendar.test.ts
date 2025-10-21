import { describe, expect, it } from 'vitest'
import {
  buildInitialFormValues,
  findOverlappingUnavailableEvents,
  rangesOverlap,
  type CalendarEvent,
  type FormState
} from './GuideAvailabilityCalendar'

function makeAvailabilityResource(
  overrides: Partial<CalendarEvent['resource']> & { id: number }
): CalendarEvent['resource'] {
  return {
    id: overrides.id,
    guide_service: null,
    guide_service_name: null,
    trip: null,
    trip_title: null,
    start: '2024-01-01T10:00:00Z',
    end: '2024-01-01T12:00:00Z',
    is_available: false,
    source: 'manual',
    source_display: 'Manual',
    visibility: 'busy',
    note: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides
  } as any
}

function makeEvent(
  overrides: Partial<CalendarEvent> & { id: number },
  resourceOverrides: Partial<CalendarEvent['resource']> = {}
): CalendarEvent {
  return {
    title: 'Sample',
    start: new Date('2024-01-01T10:00:00Z'),
    end: new Date('2024-01-01T12:00:00Z'),
    allDay: false,
    resource: makeAvailabilityResource({ id: overrides.id, ...resourceOverrides }),
    ...overrides
  }
}

describe('rangesOverlap', () => {
  it('detects overlapping ranges', () => {
    const aStart = new Date('2024-04-01T08:00:00Z')
    const aEnd = new Date('2024-04-01T12:00:00Z')
    const bStart = new Date('2024-04-01T11:00:00Z')
    const bEnd = new Date('2024-04-01T13:00:00Z')
    expect(rangesOverlap(aStart, aEnd, bStart, bEnd)).toBe(true)
  })

  it('treats touching ranges as non-overlapping', () => {
    const aStart = new Date('2024-04-01T08:00:00Z')
    const aEnd = new Date('2024-04-01T10:00:00Z')
    const bStart = new Date('2024-04-01T10:00:00Z')
    const bEnd = new Date('2024-04-01T12:00:00Z')
    expect(rangesOverlap(aStart, aEnd, bStart, bEnd)).toBe(false)
  })
})

describe('findOverlappingUnavailableEvents', () => {
  const baseStart = new Date('2024-05-01T09:00:00Z')
  const baseEnd = new Date('2024-05-01T11:00:00Z')

  it('returns overlapping unavailable events only', () => {
    const overlapping = makeEvent({
      id: 1,
      start: new Date('2024-05-01T10:00:00Z'),
      end: new Date('2024-05-01T12:30:00Z')
    })
    const availableEvent = makeEvent(
      {
        id: 2,
        start: new Date('2024-05-01T09:30:00Z'),
        end: new Date('2024-05-01T10:30:00Z')
      },
      { id: 2, is_available: true }
    )
    const events = [overlapping, availableEvent]

    const result = findOverlappingUnavailableEvents(events, baseStart, baseEnd)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('ignores the event being edited when exclude id provided', () => {
    const existing = makeEvent({
      id: 3,
      start: new Date('2024-05-01T07:00:00Z'),
      end: new Date('2024-05-01T10:30:00Z')
    })

    const result = findOverlappingUnavailableEvents([existing], baseStart, baseEnd, {
      excludeAvailabilityId: 3
    })
    expect(result).toHaveLength(0)
  })
})

describe('buildInitialFormValues', () => {
  it('defaults to busy visibility for new blocks', () => {
    const formState: FormState = {
      mode: 'create',
      key: 'tmp',
      start: new Date('2024-06-01T08:00:00Z'),
      end: new Date('2024-06-01T10:00:00Z')
    }

    const values = buildInitialFormValues(formState)
    expect(values.visibility).toBe('busy')
    expect(values.guide_service).toBe('')
  })

  it('mirrors existing availability in edit mode', () => {
    const formState: FormState = {
      mode: 'edit',
      key: 'edit-1',
      availability: {
        id: 10,
        guide_service: 42,
        start: '2024-06-02T09:00:00Z',
        end: '2024-06-02T11:00:00Z',
        is_available: false,
        source: 'manual',
        source_display: 'Manual',
        visibility: 'detail',
        note: 'Morning off',
        trip: null,
        trip_title: null,
        guide_service_name: 'Summit Guides',
        created_at: '2024-06-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z'
      } as any
    }

    const values = buildInitialFormValues(formState)
    expect(values.visibility).toBe('detail')
    expect(values.guide_service).toBe('42')
    expect(values.note).toBe('Morning off')
  })
})
