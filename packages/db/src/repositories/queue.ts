import { WAITING_STATUSES, type LocationFilter, type LocationSlug, type WaitQueueRow } from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toWaitQueueRow } from '../mappers/queue.ts'

/**
 * The wait-time queue (ADR 33, DIA-42/43): a status on the visit, moved by
 * the front desk (arrive, room), by the provider's first write to the
 * record (`startFromRecordWrite`), or by the manual "Seen" action
 * (`remove`). The line itself is `listWaiting`; the place in it is not
 * stored, it is `rankWaitQueue` in core over the ordered rows.
 *
 * Every transition is a conditional write on the status it leaves from, so
 * a repeated click, or one that races the provider, changes nothing and
 * says so with `null` (or a count of zero).
 */
export interface QueueRepository {
  /**
   * Puts a patient in a clinic's line. Arrival creates the visit, since
   * there is no schedule to arrive against yet. A patient already waiting
   * at that clinic is returned as they are: the second "Arrived" is the
   * front desk's double click, not a second visit.
   */
  arrive(input: { patientId: string; locationId: LocationSlug; providerId: string | null }): Promise<WaitQueueRow>
  /** Arrived → roomed; null if the visit was not arrived. */
  room(visitId: string): Promise<WaitQueueRow | null>
  /** The manual "Seen": arrived or roomed → in progress; null if the visit was not waiting. */
  remove(visitId: string): Promise<WaitQueueRow | null>
  /**
   * The trigger (DIA-42): the provider wrote to this patient's record, so
   * any visit of theirs still waiting is now in progress. Returns how many
   * moved. Reads must never call this; that is the test to keep.
   */
  startFromRecordWrite(patientId: string): Promise<number>
  /** One clinic's line or all of them, by arrival. Rows for one clinic are contiguous in arrival order. */
  listWaiting(location: LocationFilter): Promise<WaitQueueRow[]>
}

const QUEUE_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
  provider: { select: { name: true } },
}

const WAITING = { in: [...WAITING_STATUSES] }

export function createQueueRepository(getClient: () => PrismaClient): QueueRepository {
  async function findWaiting(visitId: string): Promise<WaitQueueRow | null> {
    const row = await getClient().visit.findFirst({
      where: { id: visitId, status: WAITING },
      include: QUEUE_INCLUDE,
    })
    return row === null ? null : toWaitQueueRow(row)
  }

  return {
    async arrive(input) {
      const client = getClient()
      const waiting = await client.visit.findFirst({
        where: { patientId: input.patientId, locationId: input.locationId, status: WAITING },
        include: QUEUE_INCLUDE,
      })
      if (waiting !== null) return toWaitQueueRow(waiting)

      // The legacy office string the rest of the record still reads (the
      // roster, the review queue) is the clinic's legacy name.
      const location = await client.location.findUniqueOrThrow({ where: { slug: input.locationId } })
      const now = new Date()
      const row = await client.visit.create({
        data: {
          patientId: input.patientId,
          dateOfService: now,
          office: location.legacyName,
          locationId: location.slug,
          modality: 'in_person',
          status: 'arrived',
          arrivedAt: now,
          providerId: input.providerId,
        },
        include: QUEUE_INCLUDE,
      })
      return toWaitQueueRow(row)
    },

    async room(visitId) {
      const { count } = await getClient().visit.updateMany({
        where: { id: visitId, status: 'arrived' },
        data: { status: 'roomed', roomedAt: new Date() },
      })
      return count === 0 ? null : findWaiting(visitId)
    },

    async remove(visitId) {
      const client = getClient()
      const before = await findWaiting(visitId)
      if (before === null) return null
      const { count } = await client.visit.updateMany({
        where: { id: visitId, status: WAITING },
        data: { status: 'in_progress', startedAt: new Date() },
      })
      return count === 0 ? null : before
    },

    async startFromRecordWrite(patientId) {
      const { count } = await getClient().visit.updateMany({
        where: { patientId, status: WAITING },
        data: { status: 'in_progress', startedAt: new Date() },
      })
      return count
    },

    async listWaiting(location) {
      const rows = await getClient().visit.findMany({
        where: { status: WAITING, ...(location === 'all' ? {} : { locationId: location }) },
        include: QUEUE_INCLUDE,
        orderBy: [{ locationId: 'asc' }, { arrivedAt: 'asc' }, { id: 'asc' }],
      })
      return rows.map(toWaitQueueRow)
    },
  }
}
