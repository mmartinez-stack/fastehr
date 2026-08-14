import { databaseUrlSchema } from '@fastehr/contracts'

/**
 * Reads and validates this package's configuration.
 *
 * **Called lazily, at first database use — never at import.** That is the
 * difference between a build that works and one that does not: `next build`
 * and CI import this package (the tRPC route pulls it in transitively) without
 * ever opening a connection, and neither has a DATABASE_URL. Validating at
 * module load would fail both, and the usual workaround — a placeholder value
 * in CI — trades a loud failure for a value that looks configured and is not.
 *
 * A deployment that is genuinely misconfigured therefore fails on its first
 * query rather than at boot. The trade is deliberate: the alternative costs a
 * fake variable in every environment that only builds.
 */
export function requireDatabaseUrl(): string {
  const parsed = databaseUrlSchema.safeParse(process.env.DATABASE_URL)

  if (!parsed.success) {
    const reason = process.env.DATABASE_URL === undefined ? 'is not set' : parsed.error.issues[0]?.message
    throw new Error(
      `DATABASE_URL ${reason}. See .env.example; it is required by @fastehr/db at query time.`,
    )
  }

  return parsed.data
}
