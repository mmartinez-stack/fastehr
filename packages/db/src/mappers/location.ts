import { locationSchema, type Location } from '@fastehr/contracts'
import type { Location as LocationRow } from '../generated/client/client.ts'

/** Row → contract, parsed: a slug outside the contract's list is a named failure, not a silent row. */
export function toLocation(row: LocationRow): Location {
  return locationSchema.parse({
    slug: row.slug,
    name: row.name,
    legacyName: row.legacyName,
    active: row.active,
    sortOrder: row.sortOrder,
  })
}
