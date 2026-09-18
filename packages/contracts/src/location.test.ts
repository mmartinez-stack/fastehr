import { describe, expect, it } from 'vitest'
import { locationSchema, resolveLegacyOffice } from './location.ts'

describe('resolveLegacyOffice', () => {
  it('maps the three clinics to their rows, in person', () => {
    expect(resolveLegacyOffice('Sylmar')).toEqual({ locationSlug: 'sylmar', modality: 'in_person' })
    expect(resolveLegacyOffice('PennProgram')).toEqual({ locationSlug: 'kanoga', modality: 'in_person' })
    expect(resolveLegacyOffice('Montebello')).toEqual({ locationSlug: 'montebello', modality: 'in_person' })
  })

  it('turns the two remote pseudo-offices into a modality with no clinic', () => {
    expect(resolveLegacyOffice('Telemedicine')).toEqual({ locationSlug: null, modality: 'telemedicine' })
    expect(resolveLegacyOffice('At Home')).toEqual({ locationSlug: null, modality: 'at_home' })
  })

  it('resolves blank and dead values to nothing, and refuses anything unknown', () => {
    expect(resolveLegacyOffice(null)).toEqual({ locationSlug: null, modality: 'in_person' })
    expect(resolveLegacyOffice('  ')).toEqual({ locationSlug: null, modality: 'in_person' })
    expect(resolveLegacyOffice('Israel')).toEqual({ locationSlug: null, modality: 'in_person' })
    expect(resolveLegacyOffice('Colonial Heights')).toEqual({ locationSlug: null, modality: 'in_person' })
    expect(resolveLegacyOffice('null')).toEqual({ locationSlug: null, modality: 'in_person' })
    expect(resolveLegacyOffice('Fresno')).toBeNull()
    expect(resolveLegacyOffice('sylmar')).toBeNull() // the legacy string, exactly
  })
})

describe('locationSchema', () => {
  it('describes a seeded row', () => {
    expect(
      locationSchema.parse({ slug: 'kanoga', name: 'Kanoga', legacyName: 'PennProgram', active: true, sortOrder: 2 }),
    ).toMatchObject({ slug: 'kanoga' })
    expect(locationSchema.safeParse({ slug: 'fresno', name: 'Fresno', legacyName: 'x', active: true, sortOrder: 9 }).success).toBe(false)
  })
})
