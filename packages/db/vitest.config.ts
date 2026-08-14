import { defineConfig } from 'vitest/config'

/**
 * Unit tests: no database, no environment, runs anywhere.
 *
 * Integration tests are excluded here and run from
 * `vitest.integration.config.ts` under `pnpm test:integration`. The split is
 * deliberate — `turbo run test` has to stay runnable on a fresh clone with
 * nothing installed but node_modules, which is the property the CI job in
 * .github/workflows/ci.yml depends on.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'src/generated/**', '**/*.integration.test.ts'],
    env: {
      // Pinned west of UTC, and not for the developer's benefit: CI runners are
      // UTC, where converting a `@db.Date` through local time gives the right
      // answer by accident. The date-of-birth-off-by-one bug is invisible in a
      // UTC process and fails here.
      TZ: 'America/Los_Angeles',
    },
  },
})
