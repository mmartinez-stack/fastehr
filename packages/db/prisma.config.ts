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
 * `datasource.url` is deliberately NOT set here. The config's `env()` helper
 * resolves eagerly, at config-load time, so declaring it would make every CLI
 * invocation — `generate` included — fail without a database URL. `generate`
 * does not need one, and it runs in CI and on a fresh clone where none exists.
 * The URL stays in the schema's `datasource` block, where `env()` is resolved
 * lazily and only by the commands that actually connect (`migrate`, `db`,
 * `studio`).
 *
 * At runtime the URL reaches the client through the pg driver adapter instead
 * (see src/index.ts); Prisma 7 never reads the datasource block itself.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
})
