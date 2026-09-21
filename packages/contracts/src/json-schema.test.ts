import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toJsonSchema } from './json-schema.ts'
import { locationFilteredInput } from './location.ts'
import { searchPatientsInput, sendPatientIntakeInput } from './patient.ts'

describe('toJsonSchema', () => {
  it('describes a contract as a plain JSON Schema object without the dialect key', () => {
    const schema = toJsonSchema(sendPatientIntakeInput)
    expect(schema).not.toHaveProperty('$schema')
    expect(schema).toMatchObject({ type: 'object', required: expect.arrayContaining(['firstName', 'lastName', 'phone']) })
  })

  it('describes the input side of a transform, not its output', () => {
    // `query` is interpreted into fields on the way in; a caller still sends a string.
    const schema = toJsonSchema(searchPatientsInput) as { properties: { query: { type: string } } }
    expect(schema.properties.query.type).toBe('string')
  })

  it('keeps enums, so a documented location filter lists the clinics', () => {
    expect(JSON.stringify(toJsonSchema(locationFilteredInput))).toContain('"sylmar"')
  })

  it('does not throw on constructs JSON Schema cannot express', () => {
    expect(() => toJsonSchema(z.date())).not.toThrow()
  })

  it('refuses anything that is not a Zod schema, by name', () => {
    expect(() => toJsonSchema({})).toThrow(/expected a Zod schema/)
  })
})
