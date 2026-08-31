import { z } from 'zod'

/**
 * The clinic sites a record can belong to and an actor can be scoped to.
 *
 * This is domain vocabulary, so it belongs here rather than in the app's mock
 * fixtures where it started — an office is an authorization boundary, and an
 * authorization boundary defined in `src/lib/mock-data.ts` is one the server
 * cannot enforce. See ADR 22.
 *
 * The values are the legacy system's real active sites (they replaced the
 * mockup's invented names on 2026-08-31, once the migrated data showed the
 * actual distribution). Two legacy sites are deliberately absent: Israel and
 * Colonial Heights, dead sites with 3 patient records between them — those
 * records still read back through the patient entity's plain-string `office`
 * field, but no new record and no actor scope can name them.
 */
export const officeSchema = z.enum(['Sylmar', 'Montebello', 'PennProgram', 'Telemedicine', 'At Home'])

export type Office = z.infer<typeof officeSchema>

/** Input carried by any procedure that reads or writes for a single site. */
export const officeScopedInput = z.object({ office: officeSchema })
