import type { Location } from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toLocation } from '../mappers/location.ts'

/**
 * Locations (ADR 32): read-only. The rows are seeded by migration and there
 * is no create, update, or delete; a filter lists the active ones, a report
 * over history lists them all. In `sortOrder`, so every list reads the same.
 */
export interface LocationRepository {
  list(): Promise<Location[]>
  listActive(): Promise<Location[]>
}

export function createLocationRepository(getClient: () => PrismaClient): LocationRepository {
  return {
    async list() {
      const rows = await getClient().location.findMany({ orderBy: { sortOrder: 'asc' } })
      return rows.map(toLocation)
    },
    async listActive() {
      const rows = await getClient().location.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
      return rows.map(toLocation)
    },
  }
}
