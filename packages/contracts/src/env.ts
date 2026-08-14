import { z } from 'zod'

/**
 * Environment contracts.
 *
 * These live here for the same reason the domain schemas do: ADR 5 makes
 * `contracts` the only package with a direct Zod dependency, so a package that
 * needs to validate its configuration takes the schema from here rather than
 * declaring Zod of its own. An environment variable is a shape agreement
 * between a deployment and the code — the same kind of thing this package
 * already exists to state.
 *
 * Nothing here reads `process.env`. These are schemas; the package that owns
 * the variable parses it, so a missing value fails in the package that needs
 * it, naming itself.
 */

/**
 * A PostgreSQL connection string.
 *
 * The protocol check is worth its two lines: the failure it prevents is a
 * connection string pointing at the wrong kind of database, which otherwise
 * surfaces as a driver-level parse error with no indication of which variable
 * was wrong.
 */
export const databaseUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'must be a postgresql:// connection string',
  )

/** Everything the server side of the workspace requires to run. */
export const serverEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
})

export type ServerEnv = z.infer<typeof serverEnvSchema>
