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

/**
 * The Better Auth signing secret. Sessions and password-reset tokens are only
 * as strong as this value, so a length floor is the one property worth
 * enforcing here — emptiness or a short placeholder fails by name instead of
 * silently signing cookies with `"changeme"`.
 */
export const betterAuthSecretSchema = z
  .string()
  .min(32, 'must be at least 32 characters — generate with `openssl rand -base64 32`')

/** The absolute origin the auth server trusts for its own endpoints. */
export const betterAuthUrlSchema = z.url()

/** Everything the server side of the workspace requires to run. */
export const serverEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  BETTER_AUTH_SECRET: betterAuthSecretSchema,
  BETTER_AUTH_URL: betterAuthUrlSchema,
})

export type ServerEnv = z.infer<typeof serverEnvSchema>
