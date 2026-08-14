import { z } from 'zod'

/**
 * The clinic sites a record can belong to and an actor can be scoped to.
 *
 * This is domain vocabulary, so it belongs here rather than in the app's mock
 * fixtures where it started — an office is an authorization boundary, and an
 * authorization boundary defined in `src/lib/mock-data.ts` is one the server
 * cannot enforce. See ADR 22.
 */
export const officeSchema = z.enum(['Downtown', 'Eastside', 'At Home'])

export type Office = z.infer<typeof officeSchema>

/** Input carried by any procedure that reads or writes for a single site. */
export const officeScopedInput = z.object({ office: officeSchema })
