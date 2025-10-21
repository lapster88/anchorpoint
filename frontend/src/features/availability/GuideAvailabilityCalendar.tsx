import { useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, dateFnsLocalizer, type EventProps, type SlotInfo } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, differenceInMinutes } from 'date-fns'
import enUS from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'

type GuideAvailability = {
  id: number
  guide_service: number | null
  guide_service_name?: string | null
  trip: number | null
  trip_title?: string | null
  start: string
  end: string
  is_available: boolean
  source: string
  source_display: string
  visibility: string
  note?: string | null
}

type AvailabilityResponse = {
  results?: GuideAvailability[]
}

type ServiceMembership = {
  id: number
  guide_service: number
  guide_service_name: string
  role: string
  is_active: boolean
}

export type CalendarEvent = {
  id: number
  title: string
  start: Date
  end: Date
  allDay: boolean
  resource: GuideAvailability
}

export type FormState =
  | { mode: 'create'; key: string; start: Date; end: Date }
  | { mode: 'edit'; key: string; availability: GuideAvailability }

type AvailabilityFormValues = {
  start: string
  end: string
  visibility: GuideAvailability['visibility']
  guide_service: string
  note: string
}

const locales = {
  'en-US': enUS
}

const OVERLAP_WARNING_STORAGE_KEY = 'anchorpoint.availability.overlapWarningDismissed'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 0 }),
  getDay,
  locales
})

export default function GuideAvailabilityCalendar(){
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [overlapWarningDismissed, setOverlapWarningDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(OVERLAP_WARNING_STORAGE_KEY) === 'true'
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['guide-availability'],
    queryFn: async () => (await api.get<AvailabilityResponse | GuideAvailability[]>('/api/auth/availabilities/')).data,
    enabled: isAuthenticated
  })

  const membershipsQuery = useQuery({
    queryKey: ['service-memberships'],
    queryFn: async () => (await api.get<ServiceMembership[]>('/api/auth/memberships/')).data,
    enabled: isAuthenticated
  })

  const [formState, setFormState] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const availability: GuideAvailability[] = useMemo(() => {
    if (!data) return []
    if (Array.isArray(data)) return data
    return data.results ?? []
  }, [data])

  const membershipOptions = useMemo(
    () => (membershipsQuery.data ?? []).filter((membership) => membership.is_active),
    [membershipsQuery.data]
  )

  // React-big-calendar expects plain event objects; normalise API payloads once so we can render,
  // reuse in overlap checks, and avoid re-parsing dates inside the component tree.
  const events: CalendarEvent[] = useMemo(() => {
    return availability
      .map((slot) => {
        const startDate = new Date(slot.start)
        const endDate = new Date(slot.end)
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
          return null
        }

        const allDay = isAllDayBlock(startDate, endDate)
        const availabilityLabel = slot.is_available ? 'Available' : 'Unavailable'
        const tripLabel = slot.trip_title ? ` · ${slot.trip_title}` : ''
        const serviceLabel = slot.guide_service_name ? ` (${slot.guide_service_name})` : ''

        return {
          id: slot.id,
          title: `${availabilityLabel}${tripLabel}${serviceLabel}`,
          start: startDate,
          end: endDate,
          allDay,
          resource: slot
        }
      })
      .filter((event): event is CalendarEvent => Boolean(event))
  }, [availability])

  const createMutation = useMutation({
    // Creating availability triggers a refetch for the calendar list so every view stays in sync.
    mutationFn: async (payload: Record<string, unknown>) => (await api.post('/api/auth/availabilities/', payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guide-availability'] })
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      (await api.patch(`/api/auth/availabilities/${id}/`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guide-availability'] })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/auth/availabilities/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guide-availability'] })
    }
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  const handleSlotSelect = (slotInfo: SlotInfo) => {
    const start = slotInfo.start as Date
    const end = slotInfo.end as Date
    setFormState({
      mode: 'create',
      key: `create-${start.toISOString()}-${end.toISOString()}`,
      start,
      end
    })
    setFormError(null)
  }

  const handleEventSelect = (event: CalendarEvent) => {
    setFormState({
      mode: 'edit',
      key: `edit-${event.id}-${event.start.toISOString()}`,
      availability: event.resource
    })
    setFormError(null)
  }

  const handleCloseModal = () => {
    setFormState(null)
    setFormError(null)
  }

  const handleSubmit = async (values: AvailabilityFormValues) => {
    setFormError(null)
    const startDate = new Date(values.start)
    const endDate = new Date(values.end)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setFormError('Please provide valid start and end times.')
      return
    }
    if (endDate <= startDate) {
      setFormError('End time must be after start time.')
      return
    }

    const isAvailable = formState?.mode === 'edit' ? formState.availability.is_available : false

    const payload: Record<string, unknown> = {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      is_available: isAvailable,
      visibility: values.visibility,
      note: values.note.trim() ? values.note.trim() : null
    }
    if (values.guide_service) {
      payload.guide_service = Number(values.guide_service)
    } else if (formState?.mode === 'edit' && formState.availability.guide_service) {
      payload.guide_service = null
    }

    try {
      if (formState?.mode === 'edit') {
        await updateMutation.mutateAsync({ id: formState.availability.id, payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      handleCloseModal()
    } catch (mutationError) {
      setFormError('Unable to save availability. Please try again.')
      // eslint-disable-next-line no-console
      console.error(mutationError)
    }
  }

  const handleDelete = async () => {
    if (formState?.mode !== 'edit') return
    setFormError(null)
    try {
      await deleteMutation.mutateAsync(formState.availability.id)
      handleCloseModal()
    } catch (mutationError) {
      setFormError('Unable to delete availability. Please try again.')
      // eslint-disable-next-line no-console
      console.error(mutationError)
    }
  }

  if (!isAuthenticated) {
    return null
  }

  if (isLoading) {
    return <div>Loading calendar…</div>
  }

  if (error) {
    return <div className="text-red-600">Unable to load availability.</div>
  }

  const modalInitialValues = formState ? buildInitialFormValues(formState) : null

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Guide Availability</h2>
        <p className="text-sm text-slate-600">
          Click and drag to block off time you are unavailable. Delete blocks when you reopen your schedule.
        </p>
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow">
        <div className="h-[720px]">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            defaultView="month"
            views={['month', 'week', 'day']}
            selectable
            popup
            onSelectSlot={handleSlotSelect}
            onSelectEvent={handleEventSelect}
            eventPropGetter={eventPropGetter}
            components={{
              event: AvailabilityEvent
            }}
            tooltipAccessor={(event) => buildTooltip(event.resource)}
          />
        </div>
      </div>
      <Legend />

      {formState && modalInitialValues && (
        <AvailabilityFormModal
          key={formState.key}
          mode={formState.mode}
          initialValues={modalInitialValues}
          memberships={membershipOptions}
          isSubmitting={isSubmitting}
          error={formError}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          onDelete={formState.mode === 'edit' ? handleDelete : undefined}
          existingEvents={events}
          hideOverlapWarning={overlapWarningDismissed}
          onDismissOverlapWarning={() => {
            setOverlapWarningDismissed(true)
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(OVERLAP_WARNING_STORAGE_KEY, 'true')
            }
          }}
          currentAvailabilityId={formState.mode === 'edit' ? formState.availability.id : undefined}
          originalAvailability={formState.mode === 'edit' ? formState.availability : undefined}
        />
      )}
    </div>
  )
}

function AvailabilityEvent({ event }: EventProps<CalendarEvent>){
  const slot = event.resource
  return (
    <div className="text-xs leading-tight">
      <div className="font-semibold">
        {slot.is_available ? 'Available' : 'Unavailable'}
        {slot.trip_title ? ` · ${slot.trip_title}` : ''}
      </div>
      {slot.note && <div className="text-[11px]">{slot.note}</div>}
    </div>
  )
}

function eventPropGetter(event: CalendarEvent){
  const isAvailable = event.resource.is_available
  const baseColor = isAvailable ? '#6EE7B7' : '#FCA5A5'
  const textColor = isAvailable ? '#065F46' : '#7F1D1D'

  return {
    style: {
      backgroundColor: baseColor,
      borderRadius: '8px',
      color: textColor,
      border: 'none',
      display: 'block',
      paddingInline: '8px',
      paddingBlock: '4px'
    }
  }
}

function buildTooltip(slot: GuideAvailability): string {
  const start = new Date(slot.start)
  const end = new Date(slot.end)
  const timeRange = `${format(start, 'PPpp')} – ${format(end, 'PPpp')}`
  const details = [
    slot.is_available ? 'Available' : 'Unavailable',
    timeRange,
    slot.trip_title ? `Trip: ${slot.trip_title}` : null,
    slot.guide_service_name ? `Service: ${slot.guide_service_name}` : null,
    slot.note ? `Note: ${slot.note}` : null,
    `Visibility: ${slot.visibility}`,
    `Source: ${slot.source_display}`
  ].filter(Boolean)
  return details.join('\n')
}

function isAllDayBlock(start: Date, end: Date): boolean {
  const minutes = differenceInMinutes(end, start)
  const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0
  const endsAtMidnight = end.getHours() === 0 && end.getMinutes() === 0
  return startsAtMidnight && endsAtMidnight && minutes >= 24 * 60
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart
}

type OverlapOptions = {
  excludeAvailabilityId?: number
}

export function findOverlappingUnavailableEvents(
  events: CalendarEvent[],
  windowStart: Date,
  windowEnd: Date,
  options: OverlapOptions = {}
): CalendarEvent[] {
  if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) {
    return []
  }
  const { excludeAvailabilityId } = options
  return events.filter((event) => {
    if (event.resource.is_available) {
      return false
    }
    if (excludeAvailabilityId && event.resource.id === excludeAvailabilityId) {
      return false
    }
    return rangesOverlap(windowStart, windowEnd, event.start, event.end)
  })
}

function Legend(){
  return (
    <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600">
      <span className="font-medium">Legend:</span>
      <LegendItem colorClass="bg-rose-200 border-rose-300 text-rose-800" label="Unavailable block" />
      <LegendItem colorClass="bg-emerald-200 border-emerald-300 text-emerald-800" label="Available (system)" />
    </div>
  )
}

function LegendItem({ colorClass, label }: { colorClass: string; label: string }){
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full border ${colorClass}`} />
      {label}
    </span>
  )
}

export function buildInitialFormValues(formState: FormState): AvailabilityFormValues {
  if (formState.mode === 'create') {
    return {
      start: toDatetimeLocal(formState.start),
      end: toDatetimeLocal(formState.end),
      visibility: 'busy',
      guide_service: '',
      note: ''
    }
  }

  const { availability } = formState
  return {
    start: toDatetimeLocal(new Date(availability.start)),
    end: toDatetimeLocal(new Date(availability.end)),
    visibility: availability.visibility,
    guide_service: availability.guide_service ? String(availability.guide_service) : '',
    note: availability.note ?? ''
  }
}

function toDatetimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

type AvailabilityFormModalProps = {
  mode: FormState['mode']
  initialValues: AvailabilityFormValues
  memberships: ServiceMembership[]
  isSubmitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: AvailabilityFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  existingEvents: CalendarEvent[]
  hideOverlapWarning: boolean
  onDismissOverlapWarning: () => void
  currentAvailabilityId?: number
  originalAvailability?: GuideAvailability
}

function AvailabilityFormModal({
  mode,
  initialValues,
  memberships,
  isSubmitting,
  error,
  onClose,
  onSubmit,
  onDelete,
  existingEvents,
  hideOverlapWarning,
  onDismissOverlapWarning,
  currentAvailabilityId,
  originalAvailability
}: AvailabilityFormModalProps){
  const [values, setValues] = useState<AvailabilityFormValues>(initialValues)

  const handleChange = <Key extends keyof AvailabilityFormValues>(
    key: Key,
    value: AvailabilityFormValues[Key]
  ) => {
    setValues((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit(values)
  }

  const currentStart = new Date(values.start)
  const currentEnd = new Date(values.end)
  const overlappingUnavailable = useMemo(
    () =>
      findOverlappingUnavailableEvents(existingEvents, currentStart, currentEnd, {
        excludeAvailabilityId: currentAvailabilityId
      }),
    [currentStart, currentEnd, existingEvents, currentAvailabilityId]
  )

  const isSystemGenerated = originalAvailability && originalAvailability.source !== 'manual'

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <header className="mb-4">
          <h3 className="text-lg font-semibold">
            {mode === 'edit' ? 'Edit unavailable block' : 'Add unavailable block'}
          </h3>
          <p className="text-sm text-slate-600">
            Times use your local timezone. Remove the block when you’re free again.
          </p>
          {isSystemGenerated && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              This block was generated automatically ({originalAvailability?.source_display}). You can adjust the dates,
              but deleting it may affect linked records.
            </p>
          )}
          {!!overlappingUnavailable.length && !hideOverlapWarning && (
            <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-medium">Warning: this overlaps {overlappingUnavailable.length} existing unavailable block(s).</p>
              <ul className="list-disc pl-4">
                {/* List the first few collisions so guides understand what they are about to override. */}
                {overlappingUnavailable.slice(0, 3).map((event) => (
                  <li key={event.id}>
                    {format(event.start, 'PPpp')} – {format(event.end, 'PPpp')}
                  </li>
                ))}
              </ul>
              {overlappingUnavailable.length > 3 && <p>…and more.</p>}
              <button
                type="button"
                className="text-xs font-medium text-amber-700 underline"
                onClick={onDismissOverlapWarning}
              >
                Don’t show this warning again
              </button>
            </div>
          )}
        </header>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3">
            <label className="text-sm font-medium text-slate-700">
              Start
              <input
                required
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={values.start}
                onChange={(event) => handleChange('start', event.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              End
              <input
                required
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={values.end}
                onChange={(event) => handleChange('end', event.target.value)}
              />
            </label>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Visibility
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={values.visibility}
              onChange={(event) => handleChange('visibility', event.target.value as GuideAvailability['visibility'])}
            >
              <option value="busy">Busy (hide details)</option>
              <option value="detail">Detailed (show notes)</option>
              <option value="private">Private (only you can see)</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Applies to service
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={values.guide_service}
              onChange={(event) => handleChange('guide_service', event.target.value)}
            >
              <option value="">Unassigned</option>
              {memberships.map((membership) => (
                <option key={membership.id} value={String(membership.guide_service)}>
                  {membership.guide_service_name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Notes
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder="Optional context (shown when visibility allows)"
              value={values.note}
              onChange={(event) => handleChange('note', event.target.value)}
            />
          </label>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {onDelete && (
              <button
                type="button"
                className="text-sm font-medium text-rose-600 underline underline-offset-2 disabled:opacity-50"
                onClick={onDelete}
                disabled={isSubmitting}
              >
                Delete
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
