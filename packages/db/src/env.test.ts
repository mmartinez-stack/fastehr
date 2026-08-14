import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireDatabaseUrl } from './env.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('requireDatabaseUrl', () => {
  it('returns the connection string when it is valid', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/fastehr')
    expect(requireDatabaseUrl()).toBe('postgresql://postgres:postgres@localhost:5432/fastehr')
  })

  it('accepts the postgres:// spelling', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost:5432/fastehr')
    expect(requireDatabaseUrl()).toBe('postgres://localhost:5432/fastehr')
  })

  it('names the variable when it is unset', () => {
    vi.stubEnv('DATABASE_URL', undefined)
    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL is not set/)
  })

  it('rejects a connection string for the wrong kind of database', () => {
    // Without this check the value reaches the driver and fails as an opaque
    // parse error, with nothing pointing at which variable was wrong.
    vi.stubEnv('DATABASE_URL', 'mysql://localhost:3306/fastehr')
    expect(() => requireDatabaseUrl()).toThrow(/must be a postgresql:\/\/ connection string/)
  })

  it('is not called at import time', async () => {
    // The property that keeps `next build` and CI working without a database:
    // importing the package must neither read nor require configuration.
    vi.stubEnv('DATABASE_URL', undefined)
    const { db } = await import('./index.ts')
    expect(typeof db.patients.findById).toBe('function')
  })
})
