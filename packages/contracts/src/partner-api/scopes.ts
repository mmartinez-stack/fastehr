import { z } from 'zod'

/**
 * Partner API scopes (ADR 37): one per capability the vendor asked for, and
 * default deny. A key carries a subset; an operation names the one it needs
 * (`scope` on its registry entry, ./operations.ts), and the chain refuses a
 * key without it.
 *
 * The scope-to-endpoint matrix is not a second table: it is the `scope`
 * field of the registry, read by the router, the chain, the OpenAPI
 * document, and the scope-matrix test. A scope listed here but named by no
 * operation is one of the planned ones below; the test in ./scopes.test.ts
 * pins that the vocabulary does not rot silently.
 */
export const API_SCOPES = [
  'patients:lookup',
  'patients:verify',
  'medications:read',
  'refills:write',
  'tasks:write',
  'queue:read',
  'appointments:read',
  'appointments:write',
  'interactions:write',
] as const

export const partnerScopeSchema = z.enum(API_SCOPES)
export type PartnerScope = z.infer<typeof partnerScopeSchema>

/**
 * Scopes whose operations arrive with later slices (endpoints 3 to 10 of the
 * vendor's list). They exist now so a key can be issued with the full set
 * once and so the vocabulary is decided in one place.
 */
export const PLANNED_SCOPES: readonly PartnerScope[] = [
  'medications:read',
  'refills:write',
  'tasks:write',
  'appointments:read',
  'appointments:write',
  'interactions:write',
]
