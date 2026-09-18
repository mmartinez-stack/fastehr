import { z } from 'zod'

/**
 * Locations (ADR 32, DIA-46/47): the clinics a patient belongs to and a visit
 * happened at, as rows rather than the legacy free string. Two are active;
 * Montebello is kept inactive for its history. A location is a filter for
 * queues and reports, never a permission boundary: every signed-in user
 * sees every active location.
 *
 * The slug is the row's key, stable across environments and readable in a
 * URL; adding a location is a migration and an entry here. `legacyName` is
 * the string the legacy system stored on patients and visits, and the key
 * the consolidation maps by.
 */
export const LOCATION_SLUGS = ['sylmar', 'kanoga', 'montebello'] as const
export const locationSlugSchema = z.enum(LOCATION_SLUGS)
export type LocationSlug = z.infer<typeof locationSlugSchema>

/**
 * What a filter names: one clinic, or every clinic together ("unified", the
 * Aug 21 sync's word). A location is not a permission boundary, so the
 * check a procedure makes is only that the slug is one it knows.
 */
export const LOCATION_FILTER_ALL = 'all'
export const locationFilterSchema = z.union([locationSlugSchema, z.literal(LOCATION_FILTER_ALL)])
export type LocationFilter = z.infer<typeof locationFilterSchema>

/** Input carried by any procedure that lists for one clinic or for all of them. */
export const locationFilteredInput = z.object({ location: locationFilterSchema })

export const locationSchema = z.object({
  slug: locationSlugSchema,
  /** What staff read: "Kanoga", not the legacy "PennProgram". */
  name: z.string().min(1),
  legacyName: z.string().min(1),
  /** Inactive: hidden from filters, present for history. */
  active: z.boolean(),
  sortOrder: z.number().int(),
})
export type Location = z.infer<typeof locationSchema>

/**
 * A clinic as a public page may name it (the intake's "office you will
 * visit"): the display name to show, the legacy name the patient record
 * still stores. Nothing about activity or order; the server lists only the
 * active ones.
 */
export const locationOptionSchema = locationSchema.pick({ slug: true, name: true, legacyName: true })
export type LocationOption = z.infer<typeof locationOptionSchema>

/**
 * How a visit happened. The legacy system filed remote care under two
 * pseudo-offices, Telemedicine and At Home; here those are the modality,
 * and the location (if any) is the clinic the visit counts against.
 */
export const VISIT_MODALITIES = ['in_person', 'telemedicine', 'at_home'] as const
export const visitModalitySchema = z.enum(VISIT_MODALITIES)
export type VisitModality = z.infer<typeof visitModalitySchema>

/**
 * Legacy office values that name no clinic and no modality: two dead sites
 * with a handful of records, and the literal string "null" a legacy form
 * once wrote. They resolve to no location rather than failing an import,
 * because the rows that carry them are real patients and visits.
 */
export const LEGACY_DEAD_OFFICES = ['Israel', 'Colonial Heights', 'null'] as const

export interface LegacyOfficeResolution {
  locationSlug: LocationSlug | null
  modality: VisitModality
}

const CLINICS: Readonly<Record<string, LocationSlug>> = {
  Sylmar: 'sylmar',
  PennProgram: 'kanoga',
  Montebello: 'montebello',
}

/**
 * The consolidation mapping (ADR 32 § consolidation), for the import scripts
 * and the repositories alike. A clinic resolves to its row; Telemedicine and
 * At Home resolve to a modality with no clinic of their own (the caller may
 * attribute them through the patient); blank and dead values resolve to
 * nothing. An unknown string returns `null`, and an import must stop on it:
 * a location is never invented by a typo.
 */
export function resolveLegacyOffice(office: string | null | undefined): LegacyOfficeResolution | null {
  const value = office?.trim() ?? ''
  if (value === '') return { locationSlug: null, modality: 'in_person' }
  const clinic = CLINICS[value]
  if (clinic !== undefined) return { locationSlug: clinic, modality: 'in_person' }
  if (value === 'Telemedicine') return { locationSlug: null, modality: 'telemedicine' }
  if (value === 'At Home') return { locationSlug: null, modality: 'at_home' }
  if ((LEGACY_DEAD_OFFICES as readonly string[]).includes(value)) {
    return { locationSlug: null, modality: 'in_person' }
  }
  return null
}
