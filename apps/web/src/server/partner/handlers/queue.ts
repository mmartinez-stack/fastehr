import { LOCATION_FILTER_ALL, type LocationSlug, type queueCountOperation } from '@fastehr/contracts'
import { minutesWaiting, rankWaitQueue } from '@fastehr/core'
import type { OperationHandler } from '../chain.ts'
import { PartnerApiError } from '../errors.ts'

/**
 * The live queue count (ADR 36, over ADR 33's queue). The same rows and the
 * same functions the staff screen uses, reduced to a number per clinic and
 * the longest wait; never a name, an id, or an arrival time. A key
 * restricted to some clinics sees only those, and asking for a clinic it
 * may not see, or one that is not active, answers `not_found`.
 */
export const queueCount: OperationHandler<typeof queueCountOperation> = async ({ ctx, query }) => {
  const active = (await ctx.db.locations.listActive()).map((location) => location.slug)
  const permitted = active.filter((slug) => ctx.actor.locations.length === 0 || ctx.actor.locations.includes(slug))

  const requested = query.location
  if (requested !== LOCATION_FILTER_ALL && !permitted.includes(requested)) throw new PartnerApiError('not_found')
  const clinics: LocationSlug[] = requested === LOCATION_FILTER_ALL ? permitted : [requested]

  const now = ctx.now()
  const ranked = rankWaitQueue(await ctx.db.queue.listWaiting(requested))
  const byLocation = clinics.map((location) => {
    const waits = ranked.filter((entry) => entry.locationId === location).map((entry) => minutesWaiting(entry.arrivedAt, now))
    return { location, waiting: waits.length, longestWaitMinutes: waits.length === 0 ? 0 : Math.max(...waits) }
  })

  return {
    asOf: now.toISOString(),
    location: requested,
    waiting: byLocation.reduce((sum, clinic) => sum + clinic.waiting, 0),
    longestWaitMinutes: byLocation.reduce((longest, clinic) => Math.max(longest, clinic.longestWaitMinutes), 0),
    byLocation,
  }
}
