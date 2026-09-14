import { z } from 'zod'
import { locationFilteredInput, locationSlugSchema } from './location.ts'

/**
 * The wait-time queue (ADR 33, DIA-42/43): where a visit is in the day, and
 * the line a clinic's arrived patients stand in.
 *
 * Status lives on the visit, not in a queue table, so there is no second
 * source of truth. The front desk marks a patient arrived and roomed; the
 * provider's first write to the record moves the visit to in progress and
 * out of the queue (reading the chart does not), the manual "Seen" action
 * does the same for charting later, and the sign-off closes it.
 */
export const VISIT_STATUSES = ['scheduled', 'arrived', 'roomed', 'in_progress', 'closed'] as const
export const visitStatusSchema = z.enum(VISIT_STATUSES)
export type VisitStatus = z.infer<typeof visitStatusSchema>

/** The statuses that are "in the queue": here, not yet seen. */
export const WAITING_STATUSES = ['arrived', 'roomed'] as const
export const waitingStatusSchema = z.enum(WAITING_STATUSES)
export type WaitingStatus = z.infer<typeof waitingStatusSchema>

/** A visit in the queue as the repository reads it: no place in line yet. */
export const waitQueueRowSchema = z.object({
  visitId: z.uuid(),
  patient: z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.iso.date(),
  }),
  locationId: locationSlugSchema,
  status: waitingStatusSchema,
  providerId: z.string().nullable(),
  providerName: z.string().nullable(),
  arrivedAt: z.iso.datetime(),
  roomedAt: z.iso.datetime().nullable(),
})
export type WaitQueueRow = z.infer<typeof waitQueueRowSchema>

/**
 * A row with its place in its clinic's line, by arrival. `patientsAhead`
 * is the number the patient is told ("3 patients are before you"): those
 * who arrived earlier at the same clinic and are still waiting. It is
 * derived from the ordered statuses (`rankWaitQueue` in core), never stored.
 */
export const waitQueueEntrySchema = waitQueueRowSchema.extend({
  position: z.number().int().min(1),
  patientsAhead: z.number().int().min(0),
})
export type WaitQueueEntry = z.infer<typeof waitQueueEntrySchema>

/** One clinic's line, or every clinic's. */
export const listWaitQueueInput = locationFilteredInput
export type ListWaitQueueInput = z.infer<typeof listWaitQueueInput>

/**
 * Arrival creates the visit: there is no schedule yet, so a walk-in and a
 * booked patient enter the same way. The provider is the one the front
 * desk expects to see the patient, and may be left open.
 */
export const arriveInput = z.object({
  patientId: z.uuid(),
  location: locationSlugSchema,
  providerId: z.string().min(1).nullable(),
})
export type ArriveInput = z.infer<typeof arriveInput>

export const roomInput = z.object({ visitId: z.uuid() })
export type RoomInput = z.infer<typeof roomInput>

/** The manual "Seen / Remove from Queue": the provider saw the patient and will chart later. */
export const removeFromWaitQueueInput = z.object({ visitId: z.uuid() })
export type RemoveFromWaitQueueInput = z.infer<typeof removeFromWaitQueueInput>
