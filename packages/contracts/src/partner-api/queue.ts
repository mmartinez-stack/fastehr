import { z } from 'zod'
import { LOCATION_FILTER_ALL, locationFilterSchema, locationSlugSchema } from '../location.ts'

/**
 * The live queue count on the partner API (ADR 38, reading ADR 33's queue).
 *
 * A number per clinic and nothing else: never names, patient ids, or
 * arrival times. It is computed from the same rows and the same functions
 * the staff screen uses, so the bot's number is the front desk's number.
 */

export const partnerQueueCountQuery = z
  .strictObject({
    location: locationFilterSchema.default(LOCATION_FILTER_ALL).meta({
      description: 'A clinic slug, or "all" (the default) for every active clinic.',
    }),
  })
  .meta({ id: 'QueueCountQuery' })
export type PartnerQueueCountQuery = z.infer<typeof partnerQueueCountQuery>

export const partnerQueueLocationCountSchema = z
  .strictObject({
    location: locationSlugSchema,
    /** Patients marked arrived or roomed and not yet seen. */
    waiting: z.number().int().min(0),
    /** How long the longest-waiting patient has been waiting; 0 when nobody is. */
    longestWaitMinutes: z.number().int().min(0),
  })
  .meta({ id: 'QueueLocationCount' })

export const partnerQueueCountOutput = z
  .strictObject({
    asOf: z.iso.datetime(),
    location: locationFilterSchema,
    waiting: z.number().int().min(0),
    longestWaitMinutes: z.number().int().min(0),
    byLocation: z.array(partnerQueueLocationCountSchema),
  })
  .meta({ id: 'QueueCountResponse' })
export type PartnerQueueCountOutput = z.infer<typeof partnerQueueCountOutput>
