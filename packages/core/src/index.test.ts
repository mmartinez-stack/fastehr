import { describe, expect, it } from 'vitest'
import { patientDisplayName } from './index.ts'

describe('patientDisplayName', () => {
  it('formats as "Last, First"', () => {
    expect(patientDisplayName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Lovelace, Ada')
  })

  it('runs with no database and no environment', () => {
    expect(patientDisplayName({ firstName: 'Grace', lastName: 'Hopper' })).toBe('Hopper, Grace')
  })
})
