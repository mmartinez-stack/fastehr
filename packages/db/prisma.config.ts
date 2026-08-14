import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * v7 moved config out of the schema and out of package.json's `prisma` key, and
 * stopped auto-loading .env — hence the explicit `dotenv/config` import above.
 * That import is the only reason `dotenv` is a devDependency; nothing at
 * runtime reads it, because the app supplies DATABASE_URL from its own
 * environment.
 *
 * Paths resolve against this file, which is why it lives in `packages/db`
 * rather than at the repo root: the CLI runs with `packages/db` as its cwd (the
 * `generate` script), and the schema, migrations, and generated client are all
 * owned by this package.
 *
 * `datasource.url` reads `process.env` directly rather than through the config
 * package's `env()` helper. `env()` resolves eagerly at config-load time, so
 * with it every CLI invocation — `generate` included — fails when no database
 * URL is set. `generate` needs no connection, and it runs in CI and on a fresh
 * clone where there is none. Passing the value through leaves it `undefined`
 * there, and only the commands that actually connect (`migrate`, `db`,
 * `studio`) complain.
 *
 * At runtime the URL does not come from here at all: Prisma 7 takes it from the
 * pg driver adapter (see src/client.ts), which validates it through
 * `@fastehr/contracts`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
})
